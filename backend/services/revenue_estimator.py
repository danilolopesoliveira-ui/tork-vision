"""
RevenueEstimator: estimates monthly sales and revenue based on review velocity.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sku import SKU

logger = logging.getLogger(__name__)


class RevenueEstimator:
    REVIEW_MULTIPLIERS: dict[str, int] = {
        "eletronicos": 20,
        "eletrônicos": 20,
        "electronics": 20,
        "moda": 30,
        "fashion": 30,
        "casa": 15,
        "home": 15,
        "beleza": 37,
        "beauty": 37,
        "esporte": 22,
        "sports": 22,
        "brinquedos": 25,
        "toys": 25,
        "livros": 18,
        "books": 18,
        "default": 20,
    }

    def _get_multiplier(self, category: str) -> int:
        cat_lower = (category or "").lower().strip()
        for key, mult in self.REVIEW_MULTIPLIERS.items():
            if key in cat_lower or cat_lower in key:
                return mult
        return self.REVIEW_MULTIPLIERS["default"]

    def estimate_monthly_sales(self, sku: dict[str, Any]) -> int:
        """
        Estimate monthly unit sales using recent_reviews_30d × category multiplier.
        Falls back to review_count-based heuristic if recent data is absent.
        """
        recent = sku.get("recent_reviews_30d", 0) or 0
        category = sku.get("category", "")
        multiplier = self._get_multiplier(category)

        if recent > 0:
            return int(recent * multiplier)

        # Fallback: derive from total review count assuming 24-month product life
        total_reviews = sku.get("review_count", 0) or 0
        if total_reviews > 0:
            monthly_reviews_estimate = total_reviews / 24
            return int(monthly_reviews_estimate * multiplier)

        return 0

    async def estimate_seller_revenue(
        self,
        db: AsyncSession,
        seller_id: str,
        period_days: int = 30,
    ) -> dict[str, Any]:
        """Return total estimated revenue and breakdown by SKU and category."""
        stmt = select(SKU).where(SKU.seller_id == seller_id)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        scale = period_days / 30.0  # scale to requested period

        by_sku: list[dict[str, Any]] = []
        by_category: dict[str, float] = {}
        total_revenue = 0.0

        for sku in skus:
            monthly_sales = self.estimate_monthly_sales(self._to_dict(sku))
            period_sales = monthly_sales * scale
            revenue = period_sales * sku.price_current

            total_revenue += revenue
            by_sku.append({
                "sku_id": sku.sku_id,
                "title": sku.title,
                "category": sku.category,
                "price": sku.price_current,
                "estimated_period_sales": round(period_sales),
                "estimated_period_revenue": round(revenue, 2),
            })

            by_category[sku.category] = by_category.get(sku.category, 0) + revenue

        by_sku.sort(key=lambda x: x["estimated_period_revenue"], reverse=True)

        return {
            "seller_id": seller_id,
            "period_days": period_days,
            "total_estimated_revenue": round(total_revenue, 2),
            "by_sku": by_sku[:50],  # top 50
            "by_category": [
                {"category": k, "estimated_revenue": round(v, 2)}
                for k, v in sorted(by_category.items(), key=lambda i: i[1], reverse=True)
            ],
        }

    async def compare_sellers_revenue(
        self,
        db: AsyncSession,
        seller_ids: list[str],
        period_days: int = 30,
    ) -> dict[str, Any]:
        """Compare estimated revenue across multiple sellers."""
        comparisons: list[dict[str, Any]] = []

        for sid in seller_ids:
            data = await self.estimate_seller_revenue(db, sid, period_days)
            comparisons.append({
                "seller_id": sid,
                "total_estimated_revenue": data["total_estimated_revenue"],
                "by_category": data["by_category"],
            })

        comparisons.sort(key=lambda x: x["total_estimated_revenue"], reverse=True)
        total_market = sum(c["total_estimated_revenue"] for c in comparisons)

        for c in comparisons:
            c["market_share_pct"] = (
                round(c["total_estimated_revenue"] / total_market * 100, 2)
                if total_market
                else 0
            )

        return {
            "period_days": period_days,
            "sellers": comparisons,
            "total_market_revenue": round(total_market, 2),
        }

    async def get_top_revenue_skus(
        self,
        db: AsyncSession,
        seller_id: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return top SKUs by estimated monthly revenue."""
        stmt = select(SKU).where(SKU.seller_id == seller_id)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        ranked = sorted(
            skus,
            key=lambda s: self.estimate_monthly_sales(self._to_dict(s)) * s.price_current,
            reverse=True,
        )[:limit]

        return [
            {
                "sku_id": s.sku_id,
                "title": s.title,
                "category": s.category,
                "price": s.price_current,
                "estimated_monthly_sales": self.estimate_monthly_sales(self._to_dict(s)),
                "estimated_monthly_revenue": round(
                    self.estimate_monthly_sales(self._to_dict(s)) * s.price_current, 2
                ),
                "rating": s.rating,
                "review_count": s.review_count,
            }
            for s in ranked
        ]

    @staticmethod
    def _to_dict(sku: SKU) -> dict[str, Any]:
        return {
            "sku_id": sku.sku_id,
            "category": sku.category,
            "price_current": sku.price_current,
            "rating": sku.rating,
            "review_count": sku.review_count,
            "recent_reviews_30d": sku.recent_reviews_30d,
            "estimated_monthly_sales": sku.estimated_monthly_sales,
        }
