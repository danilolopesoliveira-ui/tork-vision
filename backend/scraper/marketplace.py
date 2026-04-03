"""
Marketplace scrapers for Tork Vision.
Supports: MercadoLivre, Shopee, Amazon, Magalu, Americanas.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
import urllib.parse
from typing import Any
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# HTML cache with 6-hour TTL
# ---------------------------------------------------------------------------
_html_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL = 6 * 3600  # seconds


def _cache_get(url: str) -> str | None:
    entry = _html_cache.get(url)
    if entry is None:
        return None
    html, ts = entry
    if time.monotonic() - ts > _CACHE_TTL:
        del _html_cache[url]
        return None
    return html


def _cache_set(url: str, html: str) -> None:
    _html_cache[url] = (html, time.monotonic())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_agent() -> str:
    """Return a realistic browser User-Agent string."""
    agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    ]
    import random
    return random.choice(agents)


def _default_headers() -> dict[str, str]:
    return {
        "User-Agent": _user_agent(),
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }


async def _fetch_with_backoff(
    client: httpx.AsyncClient,
    url: str,
    *,
    max_retries: int = 4,
    rate_delay: float = 0.5,
) -> httpx.Response:
    """GET with exponential back-off on 429 / 503."""
    cached = _cache_get(url)
    if cached is not None:
        # Return a fake response-like object wrapping cached HTML
        # We only need .text and .status_code from the result
        class _FakeResp:
            status_code = 200
            text = cached

        return _FakeResp()  # type: ignore[return-value]

    delay = rate_delay
    for attempt in range(max_retries):
        await asyncio.sleep(delay if attempt else 0)
        try:
            resp = await client.get(url, headers=_default_headers(), timeout=20)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            logger.warning("Network error fetching %s: %s", url, exc)
            if attempt == max_retries - 1:
                raise
            delay *= 2
            continue

        if resp.status_code in (429, 503):
            wait = delay * (2 ** attempt)
            logger.warning("Rate limited on %s, waiting %.1fs", url, wait)
            await asyncio.sleep(wait)
            continue

        if resp.status_code == 200:
            _cache_set(url, resp.text)

        return resp

    raise RuntimeError(f"Max retries exceeded for {url}")


# ---------------------------------------------------------------------------
# Marketplace detector
# ---------------------------------------------------------------------------

class MarketplaceDetector:
    _PATTERNS: dict[str, list[str]] = {
        "mercadolivre": ["mercadolivre.com.br", "mercadolibre.com"],
        "shopee": ["shopee.com.br"],
        "amazon": ["amazon.com.br", "amazon.com"],
        "magalu": ["magazineluiza.com.br", "magalu.com.br"],
        "americanas": ["americanas.com.br", "americanas.com"],
    }

    @classmethod
    def detect_marketplace(cls, url: str) -> str:
        hostname = urlparse(url).netloc.lower().lstrip("www.")
        for marketplace, patterns in cls._PATTERNS.items():
            for pattern in patterns:
                if pattern in hostname:
                    return marketplace
        return "unknown"


# ---------------------------------------------------------------------------
# Base scraper
# ---------------------------------------------------------------------------

class BaseScraper:
    marketplace: str = "base"
    _rate_limit: float = 0.5  # seconds between requests

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=30,
        )

    async def _get(self, url: str) -> httpx.Response:
        return await _fetch_with_backoff(self._client, url, rate_delay=self._rate_limit)

    async def _get_json(self, url: str) -> Any:
        resp = await self._get(url)
        return resp.json() if hasattr(resp, "json") else {}

    async def get_seller_info(self, store_url: str) -> dict[str, Any]:
        raise NotImplementedError

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def get_sku_competitors(self, sku_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    async def close(self) -> None:
        await self._client.aclose()


# ---------------------------------------------------------------------------
# MercadoLivre scraper
# ---------------------------------------------------------------------------

_CATEGORY_MAP = {
    "MLB1051": "Eletrônicos",
    "MLB1648": "Computadores",
    "MLB1000": "Eletrônicos",
    "MLB1144": "Celulares",
    "MLB1246": "Câmeras",
    "MLB1574": "TV e Vídeo",
    "MLB1714": "Áudio",
    "MLB1430": "Moda",
    "MLB1182": "Roupas",
    "MLB1183": "Calçados",
    "MLB1459": "Casa",
    "MLB1499": "Móveis",
    "MLB1276": "Beleza",
    "MLB218519": "Beleza e Saúde",
    "MLB1196": "Esportes",
    "MLB1168": "Brinquedos",
    "MLB1953": "Bebês",
    "MLB3937": "Alimentos",
    "MLB1743": "Ferramentas",
    "MLB1071": "Informática",
}


class MercadoLivreScraper(BaseScraper):
    marketplace = "mercadolivre"
    _API_BASE = "https://api.mercadolibre.com"
    _rate_limit = 0.5  # 2 req/s

    async def _resolve_nickname_to_id(self, nickname: str) -> str | None:
        """Resolve a ML store nickname to a numeric seller ID via the search API."""
        url = f"{self._API_BASE}/sites/MLB/search?nickname={nickname}&limit=1"
        try:
            data = await self._get_json(url)
            results = data.get("results", [])
            if results:
                return str(results[0].get("seller", {}).get("id", ""))
        except Exception as exc:
            logger.warning("Failed to resolve nickname %s: %s", nickname, exc)
        return None

    async def get_seller_info(self, store_url: str) -> dict[str, Any]:
        """Resolve seller info from a store URL or seller_id string."""
        numeric_id: str | None = None

        # Check for numeric ID directly in the string
        if store_url.isdigit():
            numeric_id = store_url
        else:
            # Check for seller_id query param
            match = re.search(r"seller_id=(\d+)", store_url)
            if match:
                numeric_id = match.group(1)
            else:
                # Check for /loja/{nickname} pattern — must resolve nickname to numeric ID
                loja_match = re.search(r"/loja/([^/?#]+)", store_url)
                if loja_match:
                    nickname = loja_match.group(1)
                    # If nickname is purely numeric, use it directly
                    if nickname.isdigit():
                        numeric_id = nickname
                    else:
                        numeric_id = await self._resolve_nickname_to_id(nickname)
                        await asyncio.sleep(self._rate_limit)
                else:
                    # Fallback: last URL segment
                    last_segment = store_url.rstrip("/").split("/")[-1]
                    if last_segment.isdigit():
                        numeric_id = last_segment
                    else:
                        numeric_id = await self._resolve_nickname_to_id(last_segment)
                        await asyncio.sleep(self._rate_limit)

        if not numeric_id:
            logger.warning("Could not resolve a numeric seller ID from: %s", store_url)
            return {}

        try:
            url = f"{self._API_BASE}/users/{numeric_id}"
            data = await self._get_json(url)
            await asyncio.sleep(self._rate_limit)
            return {
                "seller_id": str(data.get("id", numeric_id)),
                "seller_name": data.get("nickname", ""),
                "marketplace": self.marketplace,
                "store_url": store_url,
                "rating": data.get("seller_reputation", {}).get("level_id", ""),
                "total_sales": data.get("seller_reputation", {}).get("transactions", {}).get("completed", 0),
            }
        except Exception as exc:
            logger.warning("ML get_seller_info failed: %s", exc)
            return {"seller_id": numeric_id, "marketplace": self.marketplace, "store_url": store_url}

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20) -> list[dict[str, Any]]:
        """Fetch all listings for a seller using ML search API."""
        results: list[dict[str, Any]] = []
        offset = 0
        limit = 50

        for _ in range(max_pages):
            url = (
                f"{self._API_BASE}/sites/MLB/search"
                f"?seller_id={seller_id}&offset={offset}&limit={limit}"
            )
            try:
                data = await self._get_json(url)
                await asyncio.sleep(self._rate_limit)
            except Exception as exc:
                logger.warning("ML get_seller_skus page error: %s", exc)
                break

            items = data.get("results", [])
            if not items:
                break

            for item in items:
                results.append(self._parse_ml_item(item))

            if len(items) < limit:
                break
            offset += limit

        # Enrich the first 10 items with real review data from individual item endpoint
        for i, parsed in enumerate(results[:10]):
            item_id = parsed.get("sku_id", "")
            if not item_id:
                continue
            try:
                detail_url = f"{self._API_BASE}/items/{item_id}"
                detail = await self._get_json(detail_url)
                await asyncio.sleep(self._rate_limit)
                reviews = detail.get("reviews", {}) or {}
                rating = float(reviews.get("rating_average", parsed["rating"]) or parsed["rating"])
                review_count = int(reviews.get("total", parsed["review_count"]) or parsed["review_count"])
                results[i]["rating"] = rating
                results[i]["review_count"] = review_count
            except Exception as exc:
                logger.warning("ML item detail fetch failed for %s: %s", item_id, exc)

        return results

    def _parse_ml_item(self, item: dict) -> dict[str, Any]:
        shipping = item.get("shipping", {})
        badges: list[str] = []
        if shipping.get("free_shipping"):
            badges.append("frete_gratis")
        if item.get("installments"):
            badges.append("parcelamento")

        category_id = item.get("category_id", "")
        category_name = _CATEGORY_MAP.get(category_id, category_id)

        sold = int(item.get("sold_quantity", 0) or 0)
        reviews = int(item.get("reviews", {}).get("total", 0) or 0)
        recent_reviews = max(1, reviews // 12)
        estimated_monthly_sales = sold if sold > 0 else recent_reviews * 20

        return {
            "sku_id": item.get("id", ""),
            "title": item.get("title", ""),
            "price_current": float(item.get("price", 0)),
            "price_original": float(item.get("original_price") or item.get("price", 0)),
            "rating": float(item.get("reviews", {}).get("rating_average", 0) or 0),
            "review_count": int(item.get("reviews", {}).get("total", 0) or 0),
            "recent_reviews_30d": recent_reviews,
            "estimated_monthly_sales": estimated_monthly_sales,
            "sales_rank": None,
            "badges": badges,
            "marketplace": self.marketplace,
            "stock_status": "in_stock" if item.get("available_quantity", 0) > 0 else "out_of_stock",
            "category": category_name,
            "subcategory": "",
            "ean": None,
            "thumbnail": item.get("thumbnail", ""),
        }

    async def get_sku_competitors(self, sku_id: str) -> list[dict[str, Any]]:
        """Find other sellers offering the same item."""
        competitors: list[dict[str, Any]] = []
        try:
            # Fetch main item to get title for search
            item_url = f"{self._API_BASE}/items/{sku_id}"
            data = await self._get_json(item_url)
            await asyncio.sleep(self._rate_limit)
            title = data.get("title", "")
            if not title:
                return competitors

            q_encoded = urllib.parse.quote(title)
            search_url = f"{self._API_BASE}/sites/MLB/search?q={q_encoded}&limit=10"
            results = await self._get_json(search_url)
            await asyncio.sleep(self._rate_limit)
            for item in results.get("results", []):
                if item.get("id") != sku_id:
                    competitors.append(self._parse_ml_item(item))
        except Exception as exc:
            logger.warning("ML get_sku_competitors error: %s", exc)
        return competitors


# ---------------------------------------------------------------------------
# Shopee scraper
# ---------------------------------------------------------------------------

class ShopeeScraper(BaseScraper):
    marketplace = "shopee"
    _API_BASE = "https://shopee.com.br/api/v4"
    _rate_limit = 1.0

    async def get_seller_info(self, store_url: str) -> dict[str, Any]:
        raise NotImplementedError(
            "Shopee scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Shopee scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_sku_competitors(self, sku_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Shopee scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )


# ---------------------------------------------------------------------------
# Amazon scraper
# ---------------------------------------------------------------------------

class AmazonScraper(BaseScraper):
    marketplace = "amazon"
    _BASE = "https://www.amazon.com.br"
    _rate_limit = 1.5

    async def get_seller_info(self, store_url: str) -> dict[str, Any]:
        raise NotImplementedError(
            "Amazon scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Amazon scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_sku_competitors(self, sku_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Amazon scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )


# ---------------------------------------------------------------------------
# Magalu scraper
# ---------------------------------------------------------------------------

class MagaluScraper(BaseScraper):
    marketplace = "magalu"
    _BASE = "https://www.magazineluiza.com.br"
    _rate_limit = 1.0

    async def get_seller_info(self, store_url: str) -> dict[str, Any]:
        raise NotImplementedError(
            "Magazine Luiza scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Magazine Luiza scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_sku_competitors(self, sku_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Magazine Luiza scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )


# ---------------------------------------------------------------------------
# Americanas scraper
# ---------------------------------------------------------------------------

class AmericanasScraper(BaseScraper):
    marketplace = "americanas"
    _BASE = "https://www.americanas.com.br"
    _rate_limit = 1.0

    async def get_seller_info(self, store_url: str) -> dict[str, Any]:
        raise NotImplementedError(
            "Americanas scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Americanas scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )

    async def get_sku_competitors(self, sku_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "Americanas scraping requer configuração de proxy e está em desenvolvimento. "
            "Use o Mercado Livre por enquanto."
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

class ScraperFactory:
    _registry: dict[str, type[BaseScraper]] = {
        "mercadolivre": MercadoLivreScraper,
        "shopee": ShopeeScraper,
        "amazon": AmazonScraper,
        "magalu": MagaluScraper,
        "americanas": AmericanasScraper,
    }

    @classmethod
    def get_scraper(cls, marketplace: str) -> BaseScraper:
        scraper_cls = cls._registry.get(marketplace.lower())
        if scraper_cls is None:
            raise ValueError(f"No scraper registered for marketplace: {marketplace}")
        return scraper_cls()
