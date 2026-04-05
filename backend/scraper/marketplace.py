"""
Marketplace scrapers for Tork Vision.
Supports: MercadoLivre, Shopee, Amazon, Magalu, Americanas.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
import urllib.parse
from typing import Any
from urllib.parse import urlparse, urljoin

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ML OAuth token cache
# ---------------------------------------------------------------------------
_ml_token_cache: dict[str, Any] = {"token": None, "expires_at": 0.0}


async def _get_ml_access_token(client: "httpx.AsyncClient") -> str | None:
    """Fetch OAuth Client Credentials token from ML API. Cached for 6h."""
    app_id = os.environ.get("ML_APP_ID", "")
    secret_key = os.environ.get("ML_SECRET_KEY", "")
    if not app_id or not secret_key:
        return None

    now = time.monotonic()
    if _ml_token_cache["token"] and now < _ml_token_cache["expires_at"]:
        return _ml_token_cache["token"]

    try:
        resp = await client.post(
            "https://api.mercadolibre.com/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": app_id,
                "client_secret": secret_key,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("access_token", "")
            expires_in = int(data.get("expires_in", 21600))
            _ml_token_cache["token"] = token
            _ml_token_cache["expires_at"] = now + expires_in - 300
            logger.info("ML OAuth token obtained, expires in %ds", expires_in)
            return token
        else:
            logger.error("ML OAuth token failed: %s %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.error("ML OAuth token error: %s", exc)
    return None


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

    async def _api_get_json(self, url: str) -> dict:
        """GET ML API endpoint with OAuth Bearer token if available."""
        token = await _get_ml_access_token(self._client)
        headers = {"Accept": "application/json", "User-Agent": _user_agent()}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            resp = await self._client.get(url, headers=headers, timeout=20)
            if resp.status_code == 200:
                return resp.json()
            logger.warning("ML API %s returned %s", url, resp.status_code)
        except Exception as exc:
            logger.warning("ML API request failed for %s: %s", url, exc)
        return {}

    async def _api_fetch_seller_skus(self, seller_id: str, max_pages: int) -> list[dict[str, Any]]:
        """Fetch seller's items from ML API using OAuth token."""
        results: list[dict[str, Any]] = []
        limit = 50
        for page in range(max_pages):
            offset = page * limit
            url = f"{self._API_BASE}/sites/MLB/search?seller_id={seller_id}&limit={limit}&offset={offset}"
            data = await self._api_get_json(url)
            items = data.get("results", [])
            if not items:
                break
            for item in items:
                parsed = self._parse_ml_item(item)
                results.append(parsed)
            logger.info("API page %d seller %s: %d items (total: %d)", page, seller_id, len(items), len(results))
            if len(items) < limit:
                break
            await asyncio.sleep(self._rate_limit)
        return results

    async def _resolve_nickname_to_id(self, nickname: str) -> str | None:
        """Resolve a ML store nickname to a numeric seller ID.

        Strategy 1 (most reliable): scrape store page, extract first MLB item ID,
          call /items/{id} API to get the authoritative seller_id.
        Strategy 2: /sites/MLB/search?nickname= — authenticated items search.
        Strategy 3: /users/search?nickname= — authenticated users search.
        """
        # Strategy 1: scrape store page → extract MLB item link → lookup /items/{id}
        store_url = f"https://lista.mercadolivre.com.br/loja/{urllib.parse.quote(nickname)}/"
        try:
            resp = await self._get(store_url)
            html = resp.text if hasattr(resp, "text") else ""
            soup = BeautifulSoup(html, "lxml")

            # Collect all href links containing MLB IDs
            mlb_ids: list[str] = []
            for a in soup.find_all("a", href=True):
                m = re.search(r'(MLB\d+)', a["href"])
                if m:
                    mlb_ids.append(m.group(1))

            # Also scan raw HTML for MLB IDs
            mlb_ids += re.findall(r'MLB\d{6,}', html)
            mlb_ids = list(dict.fromkeys(mlb_ids))[:5]  # unique, first 5

            for mlb_id in mlb_ids:
                await asyncio.sleep(self._rate_limit)
                item_data = await self._api_get_json(f"{self._API_BASE}/items/{mlb_id}")
                if item_data and item_data.get("seller_id"):
                    sid = str(item_data["seller_id"])
                    logger.info("Resolved nickname %s → %s via item %s", nickname, sid, mlb_id)
                    return sid
        except Exception as exc:
            logger.warning("Nickname store-scrape failed for %s: %s", nickname, exc)

        # Strategy 2: items search with nickname filter (authenticated)
        await asyncio.sleep(self._rate_limit)
        url = f"{self._API_BASE}/sites/MLB/search?nickname={urllib.parse.quote(nickname)}&limit=1"
        try:
            data = await self._api_get_json(url)
            results = data.get("results", [])
            if results:
                sid = str(results[0].get("seller", {}).get("id", ""))
                if sid and sid != "0":
                    logger.info("Resolved nickname %s → %s (items search)", nickname, sid)
                    return sid
        except Exception as exc:
            logger.warning("Nickname items-search failed for %s: %s", nickname, exc)

        # Strategy 3: users search API (authenticated)
        await asyncio.sleep(self._rate_limit)
        url2 = f"{self._API_BASE}/users/search?nickname={urllib.parse.quote(nickname)}"
        try:
            data = await self._api_get_json(url2)
            results = data.get("results", [])
            if results:
                sid = str(results[0].get("id", ""))
                if sid and sid != "0":
                    logger.info("Resolved nickname %s → %s (users search)", nickname, sid)
                    return sid
        except Exception as exc:
            logger.warning("Nickname users-search failed for %s: %s", nickname, exc)

        logger.warning("Could not resolve nickname to numeric ID: %s", nickname)
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

        # Extract store nickname from URL to use as display name
        loja_m = re.search(r"/loja/([^/?#]+)", store_url)
        store_nickname = loja_m.group(1).replace("-", " ").title() if loja_m else None

        try:
            url = f"{self._API_BASE}/users/{numeric_id}"
            data = await self._api_get_json(url)
            await asyncio.sleep(self._rate_limit)
            if not data:
                logger.warning("ML API returned empty for users/%s — using store nickname as fallback", numeric_id)
                return {
                    "seller_id": numeric_id,
                    "seller_name": store_nickname or numeric_id,
                    "marketplace": self.marketplace,
                    "store_url": store_url,
                }
            # Prefer store URL nickname over ML account nickname
            display_name = store_nickname or data.get("name") or data.get("nickname", "")
            return {
                "seller_id": str(data.get("id", numeric_id)),
                "seller_name": display_name,
                "marketplace": self.marketplace,
                "store_url": store_url,
                "rating": data.get("seller_reputation", {}).get("level_id", ""),
                "total_sales": data.get("seller_reputation", {}).get("transactions", {}).get("completed", 0),
            }
        except Exception as exc:
            logger.warning("ML get_seller_info failed: %s", exc)
            return {"seller_id": numeric_id, "marketplace": self.marketplace, "store_url": store_url}

    async def get_seller_skus(self, seller_id: str, max_pages: int = 20, store_url: str = "") -> list[dict[str, Any]]:
        """Fetch all listings for a seller. Uses OAuth API when available, falls back to HTML scraping."""
        # Try authenticated API first — gives real data (sold_quantity, categories, ratings)
        if seller_id and seller_id.isdigit():
            token = await _get_ml_access_token(self._client)
            if token:
                logger.info("Fetching SKUs via ML API (OAuth) for seller_id=%s", seller_id)
                results = await self._api_fetch_seller_skus(seller_id, max_pages=min(max_pages, 20))
                if results:
                    logger.info("ML API returned %d SKUs for seller_id=%s", len(results), seller_id)
                    return results
                logger.warning("ML API returned 0 items for seller_id=%s, falling back to HTML scrape", seller_id)

        # Fallback: HTML scraping
        scrape_target = store_url or seller_id
        logger.info("Fetching SKUs via HTML scrape for seller_id=%s store_url=%s", seller_id, scrape_target)
        return await self._html_scrape_seller_skus(scrape_target, max_pages=min(max_pages, 5))

    async def _html_scrape_seller_skus(self, store_url: str, max_pages: int = 5) -> list[dict[str, Any]]:
        """Scrape product listings from the ML store page (no API key needed)."""
        results: list[dict[str, Any]] = []
        items_per_page = 48

        # Build base store URL — handle both full URL and seller_id fallback
        loja_match = re.search(r"/loja/([^/?#]+)", store_url)
        if loja_match:
            nickname = loja_match.group(1)
            base_url = f"https://lista.mercadolivre.com.br/loja/{urllib.parse.quote(nickname)}/"
        else:
            # Fallback: search by seller_id
            base_url = f"https://lista.mercadolivre.com.br/MLB/_Desde_{{offset}}_NoIndex_True?seller_id={store_url}"

        for page in range(max_pages):
            offset = page * items_per_page + 1
            if loja_match:
                if page == 0:
                    page_url = base_url
                else:
                    page_url = f"{base_url}_Desde_{offset}_NoIndex_True"
            else:
                page_url = base_url.format(offset=offset)

            try:
                resp = await self._get(page_url)
                await asyncio.sleep(self._rate_limit)
                if resp.status_code != 200:
                    logger.warning("HTML scrape returned %s for %s", resp.status_code, page_url)
                    break
                html = resp.text
            except Exception as exc:
                logger.warning("HTML scrape fetch error page %d: %s", page, exc)
                break

            soup = BeautifulSoup(html, "lxml")
            items = soup.select("li.ui-search-layout__item")
            if not items:
                items = soup.select("[class*='ui-search-layout__item']")
            if not items:
                logger.warning("No items found in HTML for %s page=%d", store_url, page)
                break

            for item_el in items:
                parsed = self._parse_html_item(item_el)
                if parsed:
                    results.append(parsed)

            logger.info("HTML scrape page %d url=%s: found %d items (total: %d)", page, page_url, len(items), len(results))

            if len(items) < items_per_page // 2:
                break

        logger.info("HTML scrape complete for %s: %d SKUs", store_url, len(results))
        return results

    def _parse_html_item(self, el: Any) -> dict[str, Any] | None:
        """Parse a single product element from the ML HTML search results."""
        try:
            title_el = el.select_one(
                "h2.ui-search-item__title, .poly-component__title, "
                "h3.ui-search-item__title, [class*='ui-search-item__title']"
            )
            title = title_el.get_text(strip=True) if title_el else ""
            if not title:
                return None

            price_el = el.select_one(
                ".andes-money-amount__fraction, .price-tag-fraction, "
                "[class*='andes-money-amount__fraction']"
            )
            price_str = price_el.get_text(strip=True).replace(".", "").replace(",", ".") if price_el else "0"
            try:
                price = float(price_str)
            except ValueError:
                price = 0.0

            link_el = el.select_one("a.ui-search-link, a.ui-search-item__image-link, a[href*='MLB']")
            link = link_el.get("href", "") if link_el else ""
            sku_id_match = re.search(r"MLB\d+", link)
            sku_id = sku_id_match.group(0) if sku_id_match else hashlib.md5(title.encode()).hexdigest()[:12]

            img_el = el.select_one("img[src], img[data-src]")
            thumbnail = ""
            if img_el:
                thumbnail = img_el.get("src") or img_el.get("data-src") or ""

            rating_el = el.select_one("[class*='reviews__rating'], [aria-label*='estrela'], [aria-label*='star']")
            rating = 0.0
            if rating_el:
                aria = rating_el.get("aria-label", "")
                m = re.search(r"[\d,.]+", aria)
                if m:
                    try:
                        rating = float(m.group(0).replace(",", "."))
                    except ValueError:
                        pass

            review_el = el.select_one("[class*='reviews__amount'], [class*='review-count']")
            review_count = 0
            if review_el:
                m = re.search(r"\d+", review_el.get_text())
                if m:
                    review_count = int(m.group(0))

            free_shipping = bool(el.select_one(
                "[class*='free-shipping'], [class*='frete-gratis'], [aria-label*='Frete grátis']"
            ))
            badges = ["frete_gratis"] if free_shipping else []

            # Extract seller name from poly-component__seller
            # Format: "{brand}por {store_name}" or just "{store_name}"
            seller_el = el.select_one("[class*='poly-component__seller']")
            seller_name = ""
            seller_store = ""
            if seller_el:
                seller_text = seller_el.get_text(strip=True)
                if "por " in seller_text:
                    seller_store = seller_text.split("por ")[-1].strip()
                else:
                    seller_store = seller_text

            return {
                "sku_id": sku_id,
                "title": title,
                "price_current": price,
                "price_original": price,
                "rating": rating,
                "review_count": review_count,
                "recent_reviews_30d": max(1, review_count // 12),
                "estimated_monthly_sales": max(1, review_count // 12) * 20,
                "sales_rank": None,
                "badges": badges,
                "marketplace": self.marketplace,
                "stock_status": "in_stock",
                "category": self._infer_category(title),
                "subcategory": "",
                "ean": None,
                "thumbnail": thumbnail,
                "seller_name": seller_store,
            }
        except Exception as exc:
            logger.warning("HTML item parse error: %s", exc)
            return None

    _CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
        ("Ferramentas Elétricas", ["furadeira", "parafusadeira", "esmerilhadeira", "martelete", "serra", "lixadeira", "politriz", "retífica", "soprador", "compressor", "moto-esmeril"]),
        ("Ferramentas Manuais", ["chave", "alicate", "martelo", "morsa", "paquímetro", "torquímetro", "jogo de ferramentas", "maleta", "caixa de ferramentas", "lima", "formão", "enxada", "pá"]),
        ("Abrasivos", ["disco de corte", "disco de desbaste", "lixa", "abrasivo", "rebolo", "flap", "escova de aço", "escova de nylon"]),
        ("Fixação e Adesivos", ["fita", "adesivo", "cola", "silicone", "vedante", "selante", "parafuso", "prego", "bucha", "fixador", "abraçadeira"]),
        ("Equipamentos Industriais", ["compressor", "gerador", "bomba", "motor", "inversor", "solda", "soldador", "máquina de solda", "extrator", "aspirador industrial", "lavadora"]),
        ("Segurança do Trabalho", ["epi", "capacete", "luva", "óculos", "protetor", "cinto de segurança", "colete", "bota", "máscara"]),
        ("Lubrificantes e Químicos", ["óleo", "graxa", "lubrificante", "solvente", "desengraxante", "fluido", "engraxadeira"]),
        ("Iluminação", ["luminária", "led", "lâmpada", "refletor", "holofote", "lanterna"]),
        ("Equipamentos de Medição", ["medidor", "manômetro", "termômetro", "multímetro", "detector", "nível", "trena", "fita métrica"]),
        ("Equipamentos Hidráulicos", ["mangueira", "conexão", "válvula", "registro", "engate", "tubo", "aquecedor", "chuveiro"]),
        ("Máquinas e Equipamentos", ["liquidificador", "misturador", "processador", "tostadeira", "forno", "balança", "máquina"]),
    ]

    def _infer_category(self, title: str) -> str:
        """Infer product category from title keywords."""
        title_lower = title.lower()
        for category, keywords in self._CATEGORY_KEYWORDS:
            if any(kw in title_lower for kw in keywords):
                return category
        return "Outros"

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

    async def get_sku_competitors(self, sku_id: str, title: str = "") -> list[dict[str, Any]]:
        """Find competitors for a SKU via ML API (OAuth) or HTML fallback."""
        competitors: list[dict[str, Any]] = []
        search_title = title

        try:
            token = await _get_ml_access_token(self._client)

            if token and search_title:
                # Use authenticated API search — returns real seller IDs and sales data
                q_encoded = urllib.parse.quote(search_title[:80])
                url = f"{self._API_BASE}/sites/MLB/search?q={q_encoded}&limit=20"
                data = await self._api_get_json(url)
                await asyncio.sleep(self._rate_limit)
                for item in data.get("results", []):
                    if item.get("id") == sku_id:
                        continue
                    parsed = self._parse_ml_item(item)
                    seller = item.get("seller", {})
                    parsed["seller_id"] = str(seller.get("id", ""))
                    parsed["seller_name"] = seller.get("nickname", parsed.get("seller_name", ""))
                    if parsed["seller_id"]:
                        competitors.append(parsed)
                return competitors

            # Fallback: HTML search
            if not search_title and sku_id:
                item_page = f"https://www.mercadolivre.com.br/p/{sku_id}"
                try:
                    resp = await self._get(item_page)
                    soup = BeautifulSoup(resp.text, "lxml")
                    h1 = soup.select_one("h1.ui-pdp-title, h1[class*='pdp-title']")
                    if h1:
                        search_title = h1.get_text(strip=True)
                except Exception:
                    pass

            if not search_title:
                return competitors

            q_encoded = urllib.parse.quote(search_title[:80])
            search_url = f"https://lista.mercadolivre.com.br/{q_encoded}"
            resp = await self._get(search_url)
            await asyncio.sleep(self._rate_limit)

            soup = BeautifulSoup(resp.text, "lxml")
            items = soup.select("li.ui-search-layout__item")[:10]
            for el in items:
                parsed = self._parse_html_item(el)
                if parsed and parsed.get("sku_id") != sku_id:
                    store = parsed.get("seller_name", "").strip()
                    parsed["seller_id"] = re.sub(r"\s+", "_", store.lower())[:32] if store else parsed.get("sku_id", "")[:12]
                    competitors.append(parsed)

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
