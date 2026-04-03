"""
SKUAnalysisService: portfolio analysis, gap detection, opportunity scoring.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.sku import SKU
from models.seller import Seller
from services.revenue_estimator import RevenueEstimator

logger = logging.getLogger(__name__)

_revenue_estimator = RevenueEstimator()


class SKUAnalysisService:

    async def analyze_portfolio(
        self,
        db: AsyncSession,
        seller_id: str,
    ) -> dict[str, Any]:
        """Full portfolio analysis for a seller."""
        stmt = select(SKU).where(SKU.seller_id == seller_id)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        if not skus:
            return {
                "seller_id": seller_id,
                "total_skus": 0,
                "categories": [],
                "avg_price": 0,
                "top_skus": [],
                "estimated_monthly_revenue": 0,
            }

        total = len(skus)
        avg_price = sum(s.price_current for s in skus) / total
        estimated_revenue = sum(
            _revenue_estimator.estimate_monthly_sales(self._sku_to_dict(s)) * s.price_current
            for s in skus
        )

        category_breakdown = await self.get_category_breakdown(db, seller_id)

        top_skus = sorted(
            skus,
            key=lambda s: _revenue_estimator.estimate_monthly_sales(self._sku_to_dict(s)) * s.price_current,
            reverse=True,
        )[:10]

        return {
            "seller_id": seller_id,
            "total_skus": total,
            "avg_price": round(avg_price, 2),
            "estimated_monthly_revenue": round(estimated_revenue, 2),
            "categories": category_breakdown,
            "top_skus": [self._sku_to_dict(s) for s in top_skus],
            "in_stock_count": sum(1 for s in skus if s.stock_status == "in_stock"),
            "out_of_stock_count": sum(1 for s in skus if s.stock_status != "in_stock"),
            "avg_rating": round(sum(s.rating for s in skus) / total, 2) if total else 0,
        }

    async def get_portfolio_gap(
        self,
        db: AsyncSession,
        target_seller_id: str,
        competitor_seller_ids: list[str],
    ) -> list[dict[str, Any]]:
        """
        Return SKUs that competitors sell but the target seller doesn't,
        ranked by opportunity score.
        """
        # Fetch target SKUs
        stmt = select(SKU).where(SKU.seller_id == target_seller_id)
        res = await db.execute(stmt)
        target_skus = res.scalars().all()

        target_eans = {s.ean for s in target_skus if s.ean}
        target_titles = [s.title.lower() for s in target_skus]

        # Fetch competitor SKUs
        stmt2 = select(SKU).where(SKU.seller_id.in_(competitor_seller_ids))
        res2 = await db.execute(stmt2)
        competitor_skus = res2.scalars().all()

        import difflib

        gaps: list[dict[str, Any]] = []
        seen: set[str] = set()

        for sku in competitor_skus:
            if sku.ean and sku.ean in target_eans:
                continue
            ctitle = sku.title.lower()
            if ctitle in seen:
                continue
            matches = difflib.get_close_matches(ctitle, target_titles, n=1, cutoff=0.8)
            if matches:
                continue
            seen.add(ctitle)
            opportunity = self.calculate_opportunity_score(self._sku_to_dict(sku))
            gaps.append({
                "sku_id": sku.sku_id,
                "title": sku.title,
                "category": sku.category,
                "subcategory": sku.subcategory,
                "price": sku.price_current,
                "competitor_seller_id": sku.seller_id,
                "competitor_seller_name": sku.seller_name,
                "estimated_monthly_sales": sku.estimated_monthly_sales,
                "opportunity_score": opportunity,
                "marketplace": sku.marketplace,
            })

        gaps.sort(key=lambda x: x["opportunity_score"], reverse=True)
        return gaps

    def calculate_opportunity_score(self, sku: dict[str, Any]) -> float:
        """
        Score from 0–100 based on sales volume, price, competition level, rating.
        """
        sales = sku.get("estimated_monthly_sales", 0)
        price = sku.get("price_current", 0)
        rating = sku.get("rating", 3.0)
        reviews = sku.get("review_count", 0)

        sales_score = min(sales / 500, 1.0) * 40
        revenue_potential = min((sales * price) / 50000, 1.0) * 30
        trust_score = (rating / 5.0) * 15
        review_score = min(reviews / 2000, 1.0) * 15

        return round(sales_score + revenue_potential + trust_score + review_score, 2)

    async def get_category_breakdown(
        self,
        db: AsyncSession,
        seller_id: str,
    ) -> list[dict[str, Any]]:
        """Return categories with count, avg_price, estimated_revenue."""
        stmt = select(SKU).where(SKU.seller_id == seller_id)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        by_category: dict[str, list[SKU]] = {}
        for sku in skus:
            by_category.setdefault(sku.category, []).append(sku)

        breakdown: list[dict[str, Any]] = []
        for cat, cat_skus in by_category.items():
            count = len(cat_skus)
            avg_price = sum(s.price_current for s in cat_skus) / count
            estimated_revenue = sum(
                _revenue_estimator.estimate_monthly_sales(self._sku_to_dict(s)) * s.price_current
                for s in cat_skus
            )
            breakdown.append({
                "category": cat,
                "sku_count": count,
                "avg_price": round(avg_price, 2),
                "estimated_monthly_revenue": round(estimated_revenue, 2),
                "avg_rating": round(sum(s.rating for s in cat_skus) / count, 2),
                "total_estimated_sales": sum(s.estimated_monthly_sales for s in cat_skus),
            })

        breakdown.sort(key=lambda x: x["estimated_monthly_revenue"], reverse=True)
        return breakdown

    @staticmethod
    def _sku_to_dict(sku: SKU) -> dict[str, Any]:
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
            "stock_status": sku.stock_status,
            "marketplace": sku.marketplace,
            "badges": sku.badges or [],
            "ean": sku.ean,
            "seller_id": sku.seller_id,
            "seller_name": sku.seller_name,
        }
