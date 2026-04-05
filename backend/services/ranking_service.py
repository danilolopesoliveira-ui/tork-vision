"""
RankingService: adhesion scores, top products, seller market share.
"""
from __future__ import annotations

import logging
import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sku import SKU
from models.seller import Seller

logger = logging.getLogger(__name__)


class RankingService:

    def normalize_metric(self, value: float, min_val: float, max_val: float) -> float:
        """Linear normalization to [0, 1]."""
        if max_val == min_val:
            return 0.0
        return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))

    def calculate_adhesion_score(self, sku: dict[str, Any]) -> float:
        """
        Adhesion score formula:
          score = (
              num_active_sellers * 0.25
            + normalized_volume * 0.35
            + normalized_search_freq * 0.20
            + positive_review_rate * 0.10
            + growth_30d * 0.10
          )
        Returns 0–100.
        """
        # num_active_sellers: proxy from review_count tier
        review_count = sku.get("review_count", 0)
        estimated_sales = sku.get("estimated_monthly_sales", 0)
        rating = sku.get("rating", 3.0)
        recent_reviews = sku.get("recent_reviews_30d", 0)
        price = sku.get("price_current", 0)

        # Proxy: sellers competing ~ sqrt(review_count / 50)
        num_active_sellers = min(math.sqrt(max(review_count, 0) / 50 + 1), 10.0)
        normalized_sellers = self.normalize_metric(num_active_sellers, 0, 10)

        normalized_volume = self.normalize_metric(estimated_sales, 0, 500)

        # search frequency proxy: log of (review_count + 1)
        search_freq = math.log1p(review_count)
        normalized_search_freq = self.normalize_metric(search_freq, 0, math.log1p(5000))

        # positive review rate: rating / 5
        positive_review_rate = (rating / 5.0) if rating > 0 else 0.5

        # growth: recent_reviews_30d / (review_count / 24 + 1)
        monthly_avg = (review_count / 24) if review_count > 0 else 1
        growth_30d = min(recent_reviews / (monthly_avg + 1), 3.0) / 3.0

        raw_score = (
            normalized_sellers * 0.25
            + normalized_volume * 0.35
            + normalized_search_freq * 0.20
            + positive_review_rate * 0.10
            + growth_30d * 0.10
        )

        return round(raw_score * 100, 2)

    async def get_top_products(
        self,
        db: AsyncSession,
        limit: int = 20,
        category: str | None = None,
        marketplace: str | None = None,
        seller_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return top products by adhesion score."""
        from models.seller import Seller as SellerModel
        stmt = select(SKU)
        if seller_id:
            # Resolve marketplace seller_id → internal UUID
            sel_res = await db.execute(select(SellerModel).where(SellerModel.seller_id == seller_id))
            sel = sel_res.scalars().first()
            if sel:
                stmt = stmt.where(SKU.seller_id == sel.id)
        if category:
            stmt = stmt.where(SKU.category.ilike(f"%{category}%"))
        if marketplace:
            stmt = stmt.where(SKU.marketplace == marketplace)

        result = await db.execute(stmt)
        skus = result.scalars().all()

        ranked = []
        for sku in skus:
            d = self._sku_dict(sku)
            d["adhesion_score"] = self.calculate_adhesion_score(d)
            ranked.append(d)

        ranked.sort(key=lambda x: x["adhesion_score"], reverse=True)
        return ranked[:limit]

    async def get_seller_market_share(
        self,
        db: AsyncSession,
        sku_id: str,
    ) -> dict[str, Any]:
        """
        Estimate market share (%) per seller for a given product (identified by sku_id pattern).
        Uses estimated_monthly_sales as the volume proxy.
        """
        # Find the canonical SKU
        stmt = select(SKU).where(SKU.sku_id == sku_id)
        result = await db.execute(stmt)
        target_sku = result.scalars().first()

        if not target_sku:
            return {"sku_id": sku_id, "shares": []}

        # Find similar SKUs (same EAN or similar title across sellers)
        import difflib

        all_stmt = select(SKU).where(SKU.category == target_sku.category)
        all_result = await db.execute(all_stmt)
        all_skus = all_result.scalars().all()

        target_title = target_sku.title.lower()
        related: list[SKU] = []
        for s in all_skus:
            if s.ean and target_sku.ean and s.ean == target_sku.ean:
                related.append(s)
            elif difflib.SequenceMatcher(None, s.title.lower(), target_title).ratio() >= 0.8:
                related.append(s)

        if not related:
            related = [target_sku]

        total_sales = sum(s.estimated_monthly_sales for s in related) or 1

        shares: dict[str, float] = {}
        for s in related:
            name = s.seller_name
            shares[name] = shares.get(name, 0) + s.estimated_monthly_sales

        share_list = [
            {
                "seller_name": name,
                "estimated_monthly_sales": int(vol),
                "market_share_pct": round(vol / total_sales * 100, 2),
            }
            for name, vol in sorted(shares.items(), key=lambda x: x[1], reverse=True)
        ]

        return {
            "sku_id": sku_id,
            "title": target_sku.title,
            "category": target_sku.category,
            "total_estimated_sales": total_sales,
            "shares": share_list,
        }

    @staticmethod
    def _sku_dict(sku: SKU) -> dict[str, Any]:
        return {
            "sku_id": sku.sku_id,
            "title": sku.title,
            "category": sku.category,
            "subcategory": sku.subcategory,
            "price_current": sku.price_current,
            "rating": sku.rating,
            "review_count": sku.review_count,
            "recent_reviews_30d": sku.recent_reviews_30d,
            "estimated_monthly_sales": sku.estimated_monthly_sales,
            "marketplace": sku.marketplace,
            "seller_id": sku.seller_id,
            "seller_name": sku.seller_name,
            "badges": sku.badges or [],
            "stock_status": sku.stock_status,
        }
