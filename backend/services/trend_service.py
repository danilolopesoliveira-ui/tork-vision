"""
TrendService: rising/declining products, new entrants, monthly rankings, seasonality.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sku import SKU
from models.price_history import PriceHistory
from models.sales_estimate import SalesEstimate
from services.ranking_service import RankingService

logger = logging.getLogger(__name__)

_ranking_service = RankingService()


class TrendService:

    async def get_trending_products(
        self,
        db: AsyncSession,
        days: int = 60,
    ) -> list[dict[str, Any]]:
        """
        Return products with accelerating growth.
        Growth is measured by comparing review velocity in the last 30 days
        vs the previous 30-day window.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = select(SKU).where(SKU.last_updated >= since)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        trending: list[dict[str, Any]] = []
        for sku in skus:
            monthly_avg = (sku.review_count / 24) if sku.review_count > 0 else 0
            recent = sku.recent_reviews_30d or 0
            growth_ratio = (recent / (monthly_avg + 1)) if monthly_avg >= 0 else 0

            if growth_ratio >= 1.2:  # 20%+ above average = trending
                d = _ranking_service._sku_dict(sku)
                d["growth_ratio"] = round(growth_ratio, 3)
                d["adhesion_score"] = _ranking_service.calculate_adhesion_score(d)
                trending.append(d)

        trending.sort(key=lambda x: x["growth_ratio"], reverse=True)
        return trending[:50]

    async def get_declining_products(
        self,
        db: AsyncSession,
        days: int = 60,
    ) -> list[dict[str, Any]]:
        """
        Return products losing momentum: low recent review velocity relative to historical.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = select(SKU).where(SKU.last_updated >= since)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        declining: list[dict[str, Any]] = []
        for sku in skus:
            if sku.review_count < 50:  # too few reviews to be meaningful
                continue
            monthly_avg = sku.review_count / 24
            recent = sku.recent_reviews_30d or 0
            growth_ratio = recent / (monthly_avg + 1)

            if growth_ratio < 0.5:  # below 50% of average velocity = declining
                d = _ranking_service._sku_dict(sku)
                d["growth_ratio"] = round(growth_ratio, 3)
                d["decline_severity"] = "high" if growth_ratio < 0.2 else "medium"
                declining.append(d)

        declining.sort(key=lambda x: x["growth_ratio"])
        return declining[:50]

    async def get_new_entrants(
        self,
        db: AsyncSession,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Return new SKUs (created in last N days) with high adhesion.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = select(SKU).where(SKU.created_at >= since)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        entrants: list[dict[str, Any]] = []
        for sku in skus:
            d = _ranking_service._sku_dict(sku)
            d["adhesion_score"] = _ranking_service.calculate_adhesion_score(d)
            d["days_since_launch"] = (
                datetime.now(timezone.utc) - sku.created_at.replace(tzinfo=timezone.utc)
                if sku.created_at.tzinfo is None
                else datetime.now(timezone.utc) - sku.created_at
            ).days
            entrants.append(d)

        entrants.sort(key=lambda x: x["adhesion_score"], reverse=True)
        return entrants[:30]

    async def get_monthly_ranking(
        self,
        db: AsyncSession,
        seller_id: str,
        year: int,
        month: int,
    ) -> list[dict[str, Any]]:
        """
        Return top 10 SKUs for a seller in a given month, ranked by estimated revenue.
        Uses SalesEstimate records if available, falls back to current estimates.
        """
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        period_start = datetime(year, month, 1).date()
        period_end = datetime(year, month, last_day).date()

        stmt = (
            select(SalesEstimate)
            .where(SalesEstimate.seller_id == seller_id)
            .where(SalesEstimate.period_start == period_start)
        )
        result = await db.execute(stmt)
        estimates = result.scalars().all()

        if estimates:
            # Enrich with SKU title info
            sku_ids = [e.sku_id for e in estimates]
            sku_stmt = select(SKU).where(SKU.id.in_(sku_ids))
            sku_res = await db.execute(sku_stmt)
            skus_map = {s.id: s for s in sku_res.scalars().all()}

            ranked = sorted(estimates, key=lambda e: e.estimated_revenue, reverse=True)[:10]
            return [
                {
                    "rank": i + 1,
                    "sku_id": e.sku_id,
                    "title": skus_map.get(e.sku_id, type("S", (), {"title": "—"})()).title,
                    "estimated_monthly_sales": e.estimated_monthly_sales,
                    "estimated_revenue": round(e.estimated_revenue, 2),
                    "category": e.category,
                    "period": f"{year}-{month:02d}",
                }
                for i, e in enumerate(ranked)
            ]

        # Fallback: current snapshot
        stmt2 = select(SKU).where(SKU.seller_id == seller_id)
        res2 = await db.execute(stmt2)
        skus = res2.scalars().all()

        from services.revenue_estimator import RevenueEstimator
        estimator = RevenueEstimator()

        ranked_skus = sorted(
            skus,
            key=lambda s: estimator.estimate_monthly_sales(
                {"recent_reviews_30d": s.recent_reviews_30d, "review_count": s.review_count, "category": s.category}
            ) * s.price_current,
            reverse=True,
        )[:10]

        return [
            {
                "rank": i + 1,
                "sku_id": s.sku_id,
                "title": s.title,
                "estimated_monthly_sales": estimator.estimate_monthly_sales(
                    {"recent_reviews_30d": s.recent_reviews_30d, "review_count": s.review_count, "category": s.category}
                ),
                "estimated_revenue": round(
                    estimator.estimate_monthly_sales(
                        {"recent_reviews_30d": s.recent_reviews_30d, "review_count": s.review_count, "category": s.category}
                    ) * s.price_current,
                    2,
                ),
                "category": s.category,
                "period": f"{year}-{month:02d}",
            }
            for i, s in enumerate(ranked_skus)
        ]

    async def get_seasonality_heatmap(
        self,
        db: AsyncSession,
        seller_id: str,
    ) -> dict[str, Any]:
        """
        Return a product × month matrix of estimated monthly sales volumes.
        Rows = top 20 SKUs, Columns = last 12 months.
        """
        stmt = select(SKU).where(SKU.seller_id == seller_id)
        result = await db.execute(stmt)
        skus = result.scalars().all()

        from services.revenue_estimator import RevenueEstimator
        estimator = RevenueEstimator()

        now = datetime.now(timezone.utc)
        months = []
        for i in range(11, -1, -1):
            m = (now.month - i - 1) % 12 + 1
            y = now.year - ((now.month - i - 1) // 12)
            months.append(f"{y}-{m:02d}")

        # Top 20 SKUs by revenue
        top_skus = sorted(
            skus,
            key=lambda s: estimator.estimate_monthly_sales(
                {"recent_reviews_30d": s.recent_reviews_30d, "review_count": s.review_count, "category": s.category}
            ) * s.price_current,
            reverse=True,
        )[:20]

        # Fetch SalesEstimate data for enrichment
        sku_internal_ids = [s.id for s in top_skus]
        se_stmt = select(SalesEstimate).where(SalesEstimate.sku_id.in_(sku_internal_ids))
        se_res = await db.execute(se_stmt)
        estimates_raw = se_res.scalars().all()

        # Build lookup: sku_id -> {month_str -> sales}
        se_map: dict[str, dict[str, int]] = defaultdict(dict)
        for est in estimates_raw:
            month_str = f"{est.period_start.year}-{est.period_start.month:02d}"
            se_map[est.sku_id][month_str] = est.estimated_monthly_sales

        matrix: list[dict[str, Any]] = []
        for sku in top_skus:
            base_sales = estimator.estimate_monthly_sales(
                {"recent_reviews_30d": sku.recent_reviews_30d, "review_count": sku.review_count, "category": sku.category}
            )
            row: dict[str, Any] = {
                "sku_id": sku.sku_id,
                "title": sku.title[:60],
                "category": sku.category,
            }
            for m in months:
                row[m] = se_map[sku.id].get(m, base_sales)
            matrix.append(row)

        return {
            "seller_id": seller_id,
            "months": months,
            "data": matrix,
        }
