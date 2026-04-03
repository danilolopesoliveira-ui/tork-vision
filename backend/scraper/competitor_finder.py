"""
CompetitorFinder: identifies direct and indirect competitors based on SKU overlap.
Uses EAN matching, title similarity (difflib), and category comparison.
"""
from __future__ import annotations

import difflib
import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class CompetitorInfo:
    seller_id: str
    seller_name: str
    overlap_count: int
    overlap_pct: float
    relationship: str  # "direct" | "indirect"
    shared_skus: list[str] = field(default_factory=list)


@dataclass
class CompetitorResult:
    target_seller_id: str
    total_target_skus: int
    direct_competitors: list[CompetitorInfo] = field(default_factory=list)
    indirect_competitors: list[CompetitorInfo] = field(default_factory=list)
    portfolio_gaps: list[dict[str, Any]] = field(default_factory=list)


class CompetitorFinder:
    DIRECT_THRESHOLD = 0.15   # ≥15% SKU overlap
    INDIRECT_THRESHOLD = 0.05  # ≥5% SKU overlap
    TITLE_SIMILARITY_THRESHOLD = 0.80

    def calculate_similarity_score(
        self,
        seller_a_skus: list[dict[str, Any]],
        seller_b_skus: list[dict[str, Any]],
    ) -> float:
        """Return overlap ratio between two SKU lists (0–1)."""
        if not seller_a_skus or not seller_b_skus:
            return 0.0

        a_ids = {s["sku_id"] for s in seller_a_skus if s.get("sku_id")}
        b_ids = {s["sku_id"] for s in seller_b_skus if s.get("sku_id")}

        exact_overlap = a_ids & b_ids

        # EAN matching
        a_eans = {s["ean"] for s in seller_a_skus if s.get("ean")}
        b_eans = {s["ean"] for s in seller_b_skus if s.get("ean")}
        ean_overlap: set[str] = a_eans & b_eans

        # Title similarity matching
        a_titles = [(s["sku_id"], s["title"].lower()) for s in seller_a_skus if s.get("title")]
        b_titles = [(s["sku_id"], s["title"].lower()) for s in seller_b_skus if s.get("title")]

        title_matched_a: set[str] = set()
        for aid, atitle in a_titles:
            if aid in exact_overlap:
                continue
            for bid, btitle in b_titles:
                ratio = difflib.SequenceMatcher(None, atitle, btitle).ratio()
                if ratio >= self.TITLE_SIMILARITY_THRESHOLD:
                    title_matched_a.add(aid)
                    break

        total_matches = len(exact_overlap) + len(ean_overlap) + len(title_matched_a)
        denominator = max(len(seller_a_skus), len(seller_b_skus))
        return total_matches / denominator if denominator else 0.0

    def _find_shared_skus(
        self,
        target_skus: list[dict[str, Any]],
        competitor_skus: list[dict[str, Any]],
    ) -> list[str]:
        """Return list of target SKU IDs that overlap with competitor."""
        t_ids = {s["sku_id"] for s in target_skus}
        c_ids = {s["sku_id"] for s in competitor_skus}
        exact: set[str] = t_ids & c_ids

        # EAN
        c_eans = {s["ean"] for s in competitor_skus if s.get("ean")}
        ean_matched = {s["sku_id"] for s in target_skus if s.get("ean") and s["ean"] in c_eans}

        # Titles
        c_titles = [(s["sku_id"], s["title"].lower()) for s in competitor_skus if s.get("title")]
        title_matched: set[str] = set()
        for ts in target_skus:
            if ts["sku_id"] in exact or ts["sku_id"] in ean_matched:
                continue
            ttitle = ts.get("title", "").lower()
            for _, ctitle in c_titles:
                ratio = difflib.SequenceMatcher(None, ttitle, ctitle).ratio()
                if ratio >= self.TITLE_SIMILARITY_THRESHOLD:
                    title_matched.add(ts["sku_id"])
                    break

        return list(exact | ean_matched | title_matched)

    def _find_portfolio_gaps(
        self,
        target_skus: list[dict[str, Any]],
        all_competitor_skus: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Return SKUs that competitors sell but target doesn't."""
        target_titles = [s.get("title", "").lower() for s in target_skus]
        target_eans = {s["ean"] for s in target_skus if s.get("ean")}

        gaps: list[dict[str, Any]] = []
        seen_titles: set[str] = set()

        for sku in all_competitor_skus:
            ctitle = sku.get("title", "").lower()
            if not ctitle or ctitle in seen_titles:
                continue

            # Check EAN match
            if sku.get("ean") and sku["ean"] in target_eans:
                continue

            # Check title similarity against target catalog
            is_covered = any(
                difflib.SequenceMatcher(None, ctitle, tt).ratio() >= self.TITLE_SIMILARITY_THRESHOLD
                for tt in target_titles
            )
            if not is_covered:
                seen_titles.add(ctitle)
                gaps.append({
                    "sku_id": sku.get("sku_id", ""),
                    "title": sku.get("title", ""),
                    "category": sku.get("category", ""),
                    "price": sku.get("price_current", 0),
                    "seller_id": sku.get("seller_id", ""),
                    "seller_name": sku.get("seller_name", ""),
                    "estimated_monthly_sales": sku.get("estimated_monthly_sales", 0),
                    "opportunity_score": self._score_gap(sku),
                })

        gaps.sort(key=lambda x: x["opportunity_score"], reverse=True)
        return gaps

    def _score_gap(self, sku: dict[str, Any]) -> float:
        """Simple heuristic opportunity score for a gap SKU."""
        sales = sku.get("estimated_monthly_sales", 0)
        reviews = sku.get("review_count", 0)
        price = sku.get("price_current", 0)
        rating = sku.get("rating", 3.0)

        score = 0.0
        if sales > 0:
            score += min(sales / 500, 1.0) * 40
        if reviews > 0:
            score += min(reviews / 1000, 1.0) * 30
        if price > 0:
            score += min(price / 1000, 1.0) * 20
        if rating > 0:
            score += (rating / 5.0) * 10

        return round(score, 2)

    def find_competitors(
        self,
        target_seller_id: str,
        all_skus: list[dict[str, Any]],
    ) -> CompetitorResult:
        """
        Find competitors for a given seller based on SKU overlap.

        all_skus: flat list of SKU dicts each containing 'seller_id' key.
        """
        # Group SKUs by seller
        by_seller: dict[str, list[dict[str, Any]]] = {}
        for sku in all_skus:
            sid = sku.get("seller_id", "")
            by_seller.setdefault(sid, []).append(sku)

        target_skus = by_seller.get(target_seller_id, [])
        result = CompetitorResult(
            target_seller_id=target_seller_id,
            total_target_skus=len(target_skus),
        )

        all_competitor_skus: list[dict[str, Any]] = []

        for sid, skus in by_seller.items():
            if sid == target_seller_id:
                continue

            overlap_pct = self.calculate_similarity_score(target_skus, skus)
            shared = self._find_shared_skus(target_skus, skus)
            seller_name = skus[0].get("seller_name", sid) if skus else sid

            info = CompetitorInfo(
                seller_id=sid,
                seller_name=seller_name,
                overlap_count=len(shared),
                overlap_pct=round(overlap_pct * 100, 2),
                relationship="direct" if overlap_pct >= self.DIRECT_THRESHOLD else "indirect",
                shared_skus=shared,
            )

            if overlap_pct >= self.DIRECT_THRESHOLD:
                result.direct_competitors.append(info)
                all_competitor_skus.extend(skus)
            elif overlap_pct >= self.INDIRECT_THRESHOLD:
                result.indirect_competitors.append(info)
                all_competitor_skus.extend(skus)

        # Sort by overlap descending
        result.direct_competitors.sort(key=lambda x: x.overlap_pct, reverse=True)
        result.indirect_competitors.sort(key=lambda x: x.overlap_pct, reverse=True)

        result.portfolio_gaps = self._find_portfolio_gaps(target_skus, all_competitor_skus)

        logger.info(
            "CompetitorFinder: seller=%s direct=%d indirect=%d gaps=%d",
            target_seller_id,
            len(result.direct_competitors),
            len(result.indirect_competitors),
            len(result.portfolio_gaps),
        )
        return result
