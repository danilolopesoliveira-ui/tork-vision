"""
PriceTracker: records price history and detects significant price changes.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.price_history import PriceHistory

logger = logging.getLogger(__name__)


class PriceTracker:

    async def record_price(
        self,
        db: AsyncSession,
        sku_id: str,
        seller_id: str,
        price: float,
        marketplace: str,
    ) -> PriceHistory:
        """Persist a price observation for a SKU/seller pair."""
        record = PriceHistory(
            id=str(uuid.uuid4()),
            sku_id=sku_id,
            seller_id=seller_id,
            price=price,
            recorded_at=datetime.now(timezone.utc),
            marketplace=marketplace,
        )
        db.add(record)
        await db.flush()
        logger.debug("Price recorded: sku=%s seller=%s price=%.2f", sku_id, seller_id, price)
        return record

    async def get_price_history(
        self,
        db: AsyncSession,
        sku_id: str,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Return price history for a SKU over the last N days."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = (
            select(PriceHistory)
            .where(PriceHistory.sku_id == sku_id)
            .where(PriceHistory.recorded_at >= since)
            .order_by(PriceHistory.recorded_at.asc())
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "sku_id": r.sku_id,
                "seller_id": r.seller_id,
                "price": r.price,
                "recorded_at": r.recorded_at.isoformat(),
                "marketplace": r.marketplace,
            }
            for r in rows
        ]

    async def detect_price_changes(
        self,
        db: AsyncSession,
        threshold_pct: float = 10.0,
    ) -> list[dict[str, Any]]:
        """
        Return pairs (sku_id, seller_id) where the price changed by more than
        threshold_pct within the last 30 days.
        """
        since = datetime.now(timezone.utc) - timedelta(days=30)
        stmt = (
            select(PriceHistory)
            .where(PriceHistory.recorded_at >= since)
            .order_by(PriceHistory.sku_id, PriceHistory.seller_id, PriceHistory.recorded_at.asc())
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()

        # Group by (sku_id, seller_id)
        groups: dict[tuple[str, str], list[PriceHistory]] = {}
        for row in rows:
            key = (row.sku_id, row.seller_id)
            groups.setdefault(key, []).append(row)

        changes: list[dict[str, Any]] = []
        for (sku_id, seller_id), records in groups.items():
            if len(records) < 2:
                continue
            first_price = records[0].price
            last_price = records[-1].price
            if first_price == 0:
                continue
            change_pct = ((last_price - first_price) / first_price) * 100
            if abs(change_pct) >= threshold_pct:
                changes.append({
                    "sku_id": sku_id,
                    "seller_id": seller_id,
                    "price_start": first_price,
                    "price_end": last_price,
                    "change_pct": round(change_pct, 2),
                    "direction": "down" if change_pct < 0 else "up",
                    "period_start": records[0].recorded_at.isoformat(),
                    "period_end": records[-1].recorded_at.isoformat(),
                    "marketplace": records[-1].marketplace,
                })

        changes.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
        return changes

    async def get_price_alerts(
        self,
        db: AsyncSession,
    ) -> list[dict[str, Any]]:
        """
        Return alerts for sellers that reduced price >10% in the last 7 days.
        These are actionable competitive signals.
        """
        since = datetime.now(timezone.utc) - timedelta(days=7)
        stmt = (
            select(PriceHistory)
            .where(PriceHistory.recorded_at >= since)
            .order_by(PriceHistory.sku_id, PriceHistory.seller_id, PriceHistory.recorded_at.asc())
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()

        groups: dict[tuple[str, str], list[PriceHistory]] = {}
        for row in rows:
            key = (row.sku_id, row.seller_id)
            groups.setdefault(key, []).append(row)

        alerts: list[dict[str, Any]] = []
        for (sku_id, seller_id), records in groups.items():
            if len(records) < 2:
                continue
            first_price = records[0].price
            last_price = records[-1].price
            if first_price == 0:
                continue
            change_pct = ((last_price - first_price) / first_price) * 100
            if change_pct <= -10.0:
                alerts.append({
                    "alert_type": "price_drop",
                    "sku_id": sku_id,
                    "seller_id": seller_id,
                    "price_before": first_price,
                    "price_after": last_price,
                    "drop_pct": round(abs(change_pct), 2),
                    "detected_at": records[-1].recorded_at.isoformat(),
                    "marketplace": records[-1].marketplace,
                    "severity": "high" if abs(change_pct) >= 20 else "medium",
                })

        alerts.sort(key=lambda x: x["drop_pct"], reverse=True)
        return alerts
