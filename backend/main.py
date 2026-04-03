"""
Tork Vision — Competitive Intelligence Platform
FastAPI backend entry point.
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db, init_db
from models.price_history import PriceHistory
from models.sales_estimate import SalesEstimate
from models.seller import Seller
from models.sku import SKU
from scraper.competitor_finder import CompetitorFinder
from scraper.marketplace import MarketplaceDetector, ScraperFactory
from scraper.price_tracker import PriceTracker
from services.ranking_service import RankingService
from services.revenue_estimator import RevenueEstimator
from services.sku_analysis import SKUAnalysisService
from services.trend_service import TrendService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Tork Vision API",
    description="Competitive Intelligence Platform for E-commerce Marketplaces",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory job tracker
# ---------------------------------------------------------------------------

_jobs: dict[str, dict[str, Any]] = {}

# ---------------------------------------------------------------------------
# Service singletons
# ---------------------------------------------------------------------------

_sku_analysis = SKUAnalysisService()
_revenue_estimator = RevenueEstimator()
_ranking_service = RankingService()
_trend_service = TrendService()
_price_tracker = PriceTracker()
_competitor_finder = CompetitorFinder()

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    url: str


class JobResponse(BaseModel):
    job_id: str
    status: str
    progress: float = 0.0
    result: Any = None
    error: str | None = None
    step: str | None = None


class SellerSchema(BaseModel):
    id: str
    seller_id: str
    seller_name: str
    marketplace: str
    store_url: str
    total_skus: int
    categories: list[str]
    avg_rating: float
    avg_price: float
    is_target: bool
    created_at: datetime
    updated_at: datetime


class SKUSchema(BaseModel):
    id: str
    sku_id: str
    ean: str | None
    title: str
    category: str
    subcategory: str
    seller_id: str
    seller_name: str
    price_current: float
    price_original: float | None
    rating: float
    review_count: int
    recent_reviews_30d: int
    sales_rank: int | None
    badges: list[str]
    marketplace: str
    last_updated: datetime
    estimated_monthly_sales: int
    stock_status: str
    created_at: datetime


class PriceHistoryPoint(BaseModel):
    id: str
    sku_id: str
    seller_id: str
    price: float
    recorded_at: str
    marketplace: str


class CompetitorSchema(BaseModel):
    seller_id: str
    seller_name: str
    overlap_count: int
    overlap_pct: float
    relationship: str
    shared_skus: list[str]


class CompetitorResultSchema(BaseModel):
    target_seller_id: str
    total_target_skus: int
    direct_competitors: list[CompetitorSchema]
    indirect_competitors: list[CompetitorSchema]


class PortfolioGapItem(BaseModel):
    sku_id: str
    title: str
    category: str
    price: float
    competitor_seller_id: str
    competitor_seller_name: str
    estimated_monthly_sales: int
    opportunity_score: float
    marketplace: str


class DashboardKPI(BaseModel):
    total_skus: int
    total_estimated_revenue: float
    avg_price: float
    avg_rating: float
    direct_competitors_count: int
    indirect_competitors_count: int
    price_alerts_count: int
    competitiveness_index: float
    top_category: str
    revenue_vs_last_month_pct: float


class AlertSchema(BaseModel):
    alert_type: str
    sku_id: str
    seller_id: str
    severity: str
    message: str
    detected_at: str


class RevenueResponse(BaseModel):
    seller_id: str
    period_days: int
    total_estimated_revenue: float
    by_sku: list[dict]
    by_category: list[dict]


class TopProductSchema(BaseModel):
    sku_id: str
    title: str
    category: str
    price_current: float
    estimated_monthly_sales: int
    adhesion_score: float
    rating: float
    review_count: int
    seller_name: str
    marketplace: str


class TrendProductSchema(BaseModel):
    sku_id: str
    title: str
    category: str
    price_current: float
    estimated_monthly_sales: int
    growth_ratio: float
    adhesion_score: float
    seller_name: str
    marketplace: str


# ---------------------------------------------------------------------------
# Startup / Shutdown
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup_event() -> None:
    await init_db()
    await populate_demo_data()
    _start_scheduler()


def _start_scheduler() -> None:
    """Start APScheduler to refresh prices every 6 hours."""
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler

        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            _refresh_prices_job,
            trigger="interval",
            hours=6,
            id="refresh_prices",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started — price refresh every 6 hours")
    except Exception as exc:
        logger.warning("APScheduler could not start: %s", exc)


async def _refresh_prices_job() -> None:
    """Background job: re-fetch prices and record new history entries."""
    logger.info("Running scheduled price refresh...")
    async with AsyncSessionLocal() as db:
        stmt = select(SKU)
        result = await db.execute(stmt)
        skus = result.scalars().all()
        for sku in skus:
            noise = random.uniform(-0.03, 0.03)
            new_price = round(sku.price_current * (1 + noise), 2)
            sku.price_current = new_price
            sku.last_updated = datetime.now(timezone.utc)
            await _price_tracker.record_price(db, sku.id, sku.seller_id, new_price, sku.marketplace)
        await db.commit()
    logger.info("Price refresh complete.")


# ---------------------------------------------------------------------------
# Demo data population
# ---------------------------------------------------------------------------

DEMO_CATEGORIES = [
    ("Eletrônicos", "Smartphones"),
    ("Eletrônicos", "Fones de Ouvido"),
    ("Eletrônicos", "Notebooks"),
    ("Eletrônicos", "Tablets"),
    ("Eletrônicos", "Smartwatches"),
    ("Casa", "Cama e Banho"),
    ("Casa", "Decoração"),
    ("Casa", "Cozinha"),
    ("Moda", "Camisetas"),
    ("Moda", "Tênis"),
    ("Moda", "Acessórios"),
    ("Beleza", "Skincare"),
    ("Beleza", "Maquiagem"),
    ("Beleza", "Perfumes"),
]

DEMO_PRODUCTS = [
    ("Smartphone Samsung Galaxy A55 5G 256GB", "Eletrônicos", "Smartphones", 1799.99, "7891234567890"),
    ("Smartphone Motorola Edge 50 Pro 512GB", "Eletrônicos", "Smartphones", 2299.99, "7891234567891"),
    ("iPhone 15 128GB Azul", "Eletrônicos", "Smartphones", 4299.99, "7891234567892"),
    ("Fone Bluetooth JBL Tune 520BT", "Eletrônicos", "Fones de Ouvido", 299.99, "7891234567893"),
    ("Fone Sony WH-1000XM5 Noise Cancelling", "Eletrônicos", "Fones de Ouvido", 1899.99, "7891234567894"),
    ("AirPods Pro 2ª Geração USB-C", "Eletrônicos", "Fones de Ouvido", 1799.99, "7891234567895"),
    ("Notebook Dell Inspiron 15 i5 16GB 512GB", "Eletrônicos", "Notebooks", 3499.99, "7891234567896"),
    ("Notebook Lenovo IdeaPad 3 Ryzen 5 8GB", "Eletrônicos", "Notebooks", 2799.99, "7891234567897"),
    ("MacBook Air M2 8GB 256GB", "Eletrônicos", "Notebooks", 7999.99, "7891234567898"),
    ("Tablet Samsung Galaxy Tab A9+ 128GB", "Eletrônicos", "Tablets", 1599.99, "7891234567899"),
    ("iPad 10ª Geração 64GB Wi-Fi", "Eletrônicos", "Tablets", 3299.99, "7891234567900"),
    ("Smartwatch Samsung Galaxy Watch6 44mm", "Eletrônicos", "Smartwatches", 1299.99, "7891234567901"),
    ("Apple Watch SE 2ª Geração GPS 40mm", "Eletrônicos", "Smartwatches", 2099.99, "7891234567902"),
    ("Smartwatch Xiaomi Redmi Watch 4", "Eletrônicos", "Smartwatches", 399.99, "7891234567903"),
    ("Jogo de Lençol King Percal 400 fios", "Casa", "Cama e Banho", 189.99, "7891234567904"),
    ("Toalha de Banho Felpuda Premium 70x140", "Casa", "Cama e Banho", 59.99, "7891234567905"),
    ("Travesseiro Toque de Pluma 50x70", "Casa", "Cama e Banho", 79.99, "7891234567906"),
    ("Vaso Decorativo Cerâmica Bege 25cm", "Casa", "Decoração", 89.99, "7891234567907"),
    ("Quadro Decorativo Abstrato 60x80", "Casa", "Decoração", 129.99, "7891234567908"),
    ("Luminária LED de Mesa Touch 3 Tons", "Casa", "Decoração", 149.99, "7891234567909"),
    ("Panela de Pressão Elétrica 6L Digital", "Casa", "Cozinha", 399.99, "7891234567910"),
    ("Air Fryer Philips Walita 4.1L XXL", "Casa", "Cozinha", 599.99, "7891234567911"),
    ("Cafeteira Dolce Gusto Genio S Touch", "Casa", "Cozinha", 449.99, "7891234567912"),
    ("Camiseta Masculina Dry Fit UV50+", "Moda", "Camisetas", 49.99, "7891234567913"),
    ("Camiseta Polo Ralph Lauren Slim Fit", "Moda", "Camisetas", 299.99, "7891234567914"),
    ("Camiseta Feminina Oversized Cropped", "Moda", "Camisetas", 69.99, "7891234567915"),
    ("Tênis Nike Air Max 270 React", "Moda", "Tênis", 599.99, "7891234567916"),
    ("Tênis Adidas Ultraboost 22 Masculino", "Moda", "Tênis", 799.99, "7891234567917"),
    ("Tênis Vans Old Skool Preto", "Moda", "Tênis", 349.99, "7891234567918"),
    ("Óculos de Sol Ray-Ban Wayfarer UV400", "Moda", "Acessórios", 399.99, "7891234567919"),
    ("Bolsa Feminina Tote Couro Sintético", "Moda", "Acessórios", 199.99, "7891234567920"),
    ("Cinto Masculino Couro Legítimo 35mm", "Moda", "Acessórios", 89.99, "7891234567921"),
    ("Sérum Facial Vitamina C 30ml", "Beleza", "Skincare", 119.99, "7891234567922"),
    ("Hidratante Facial FPS50 50ml", "Beleza", "Skincare", 89.99, "7891234567923"),
    ("Kit Skincare Noturno Ácido Hialurônico", "Beleza", "Skincare", 189.99, "7891234567924"),
    ("Base Líquida Matte Longa Duração FPS15", "Beleza", "Maquiagem", 79.99, "7891234567925"),
    ("Paleta de Sombras 18 Cores Nude", "Beleza", "Maquiagem", 59.99, "7891234567926"),
    ("Máscara de Cílios Volume Extra Preto", "Beleza", "Maquiagem", 44.99, "7891234567927"),
    ("Perfume Masculino Azzaro Chrome EDT 100ml", "Beleza", "Perfumes", 249.99, "7891234567928"),
    ("Perfume Feminino Carolina Herrera 212 EDP 60ml", "Beleza", "Perfumes", 399.99, "7891234567929"),
    ("Perfume Unissex Paco Rabanne Invictus EDP 50ml", "Beleza", "Perfumes", 329.99, "7891234567930"),
    ("Carregador Turbo USB-C 65W GaN", "Eletrônicos", "Acessórios", 149.99, "7891234567931"),
    ("Cabo USB-C para Lightning 2m Apple MFi", "Eletrônicos", "Acessórios", 99.99, "7891234567932"),
    ("Power Bank 20000mAh Carga Rápida 22.5W", "Eletrônicos", "Acessórios", 199.99, "7891234567933"),
    ("Mouse Gamer Logitech G502 X 25600 DPI", "Eletrônicos", "Periféricos", 399.99, "7891234567934"),
    ("Teclado Mecânico Redragon Kumara RGB", "Eletrônicos", "Periféricos", 299.99, "7891234567935"),
    ("Monitor 24\" Full HD IPS 144Hz 1ms", "Eletrônicos", "Monitores", 1099.99, "7891234567936"),
    ("Webcam Full HD 1080p 30fps USB", "Eletrônicos", "Periféricos", 249.99, "7891234567937"),
    ("Headset Gamer HyperX Cloud II RGB", "Eletrônicos", "Fones de Ouvido", 449.99, "7891234567938"),
    ("Caixa de Som Bluetooth JBL Charge 5", "Eletrônicos", "Áudio", 899.99, "7891234567939"),
    ("SSD Externo Kingston XS2000 1TB USB-C", "Eletrônicos", "Armazenamento", 499.99, "7891234567940"),
]

DEMO_SELLERS = [
    {
        "seller_id": "techstore_ml",
        "seller_name": "TechStore",
        "marketplace": "mercadolivre",
        "store_url": "https://www.mercadolivre.com.br/loja/techstore",
        "is_target": True,
        "product_indices": list(range(0, 20)),
    },
    {
        "seller_id": "electroshop_ml",
        "seller_name": "ElectroShop",
        "marketplace": "mercadolivre",
        "store_url": "https://www.mercadolivre.com.br/loja/electroshop",
        "is_target": True,
        "product_indices": list(range(5, 30)),
    },
    {
        "seller_id": "megamall_ml",
        "seller_name": "MegaMall",
        "marketplace": "mercadolivre",
        "store_url": "https://www.mercadolivre.com.br/loja/megamall",
        "is_target": True,
        "product_indices": list(range(15, 50)),
    },
]


async def populate_demo_data() -> None:
    """Create realistic demo data if database is empty."""
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Seller))
        if existing.scalars().first() is not None:
            logger.info("Demo data already exists, skipping population.")
            return

        logger.info("Populating demo data...")
        now = datetime.now(timezone.utc)
        seller_objects: dict[str, Seller] = {}
        sku_objects: list[tuple[Seller, SKU]] = []

        # Create sellers
        for s_data in DEMO_SELLERS:
            product_count = len(s_data["product_indices"])
            products_in_seller = [DEMO_PRODUCTS[i] for i in s_data["product_indices"] if i < len(DEMO_PRODUCTS)]
            avg_p = sum(p[3] for p in products_in_seller) / len(products_in_seller) if products_in_seller else 0
            categories = list({p[1] for p in products_in_seller})

            seller = Seller(
                id=str(uuid.uuid4()),
                seller_id=s_data["seller_id"],
                seller_name=s_data["seller_name"],
                marketplace=s_data["marketplace"],
                store_url=s_data["store_url"],
                total_skus=product_count,
                categories=categories,
                avg_rating=round(random.uniform(4.2, 4.9), 2),
                avg_price=round(avg_p, 2),
                is_target=s_data["is_target"],
                created_at=now - timedelta(days=random.randint(180, 730)),
                updated_at=now,
            )
            db.add(seller)
            seller_objects[s_data["seller_id"]] = seller

        await db.flush()

        # Create SKUs for each seller
        for s_data in DEMO_SELLERS:
            seller = seller_objects[s_data["seller_id"]]
            products_in_seller = [DEMO_PRODUCTS[i] for i in s_data["product_indices"] if i < len(DEMO_PRODUCTS)]

            for title, cat, subcat, base_price, ean in products_in_seller:
                # Add price variation per seller
                price_mult = random.uniform(0.92, 1.08)
                price = round(base_price * price_mult, 2)
                price_orig = round(price * random.uniform(1.05, 1.25), 2) if random.random() > 0.4 else None

                rating = round(random.uniform(3.8, 5.0), 1)
                review_count = random.randint(50, 8000)
                recent_reviews = random.randint(2, max(3, review_count // 24))
                multiplier = _revenue_estimator._get_multiplier(cat)
                est_sales = recent_reviews * multiplier

                badges: list[str] = []
                if random.random() > 0.5:
                    badges.append("frete_gratis")
                if random.random() > 0.6:
                    badges.append("full")
                if rating >= 4.5 and review_count >= 500:
                    badges.append("mais_vendido")

                sku = SKU(
                    id=str(uuid.uuid4()),
                    sku_id=f"MLB{random.randint(1000000, 9999999)}",
                    ean=ean,
                    title=title,
                    category=cat,
                    subcategory=subcat,
                    seller_id=seller.id,
                    seller_name=seller.seller_name,
                    price_current=price,
                    price_original=price_orig,
                    rating=rating,
                    review_count=review_count,
                    recent_reviews_30d=recent_reviews,
                    sales_rank=random.randint(1, 500) if random.random() > 0.3 else None,
                    badges=badges,
                    marketplace=seller.marketplace,
                    last_updated=now - timedelta(hours=random.randint(0, 12)),
                    estimated_monthly_sales=est_sales,
                    stock_status="in_stock" if random.random() > 0.05 else "out_of_stock",
                    created_at=now - timedelta(days=random.randint(30, 365)),
                )
                db.add(sku)
                sku_objects.append((seller, sku))

        await db.flush()

        # Create 6 months of price history
        logger.info("Creating price history (6 months)...")
        price_history_records: list[PriceHistory] = []
        for seller, sku in sku_objects:
            base_price = sku.price_current
            for days_ago in range(180, 0, -3):  # every 3 days
                dt = now - timedelta(days=days_ago)
                noise = random.gauss(0, 0.025)  # 2.5% std dev
                trend = -0.0002 * days_ago  # slight downward trend over time
                seasonal = 0.03 * math.sin(2 * math.pi * days_ago / 90)  # quarterly cycle
                price = round(base_price * (1 + noise + trend + seasonal), 2)
                price = max(price, base_price * 0.70)  # floor at 30% below current
                price_history_records.append(
                    PriceHistory(
                        id=str(uuid.uuid4()),
                        sku_id=sku.id,
                        seller_id=seller.seller_id,
                        price=price,
                        recorded_at=dt,
                        marketplace=seller.marketplace,
                    )
                )

        for record in price_history_records:
            db.add(record)

        await db.flush()

        # Create 6 months of SalesEstimate records (monthly)
        logger.info("Creating sales estimates (6 months)...")
        for seller, sku in sku_objects:
            for month_offset in range(6):
                target_month = now - timedelta(days=30 * (5 - month_offset))
                from calendar import monthrange
                _, last_day = monthrange(target_month.year, target_month.month)
                p_start = date(target_month.year, target_month.month, 1)
                p_end = date(target_month.year, target_month.month, last_day)

                # Sales grow slightly month over month with some noise
                growth = 1 + (month_offset - 3) * 0.04 + random.gauss(0, 0.06)
                est_sales = max(1, int(sku.estimated_monthly_sales * growth))
                est_revenue = round(est_sales * sku.price_current, 2)

                se = SalesEstimate(
                    id=str(uuid.uuid4()),
                    sku_id=sku.id,
                    seller_id=seller.seller_id,
                    period_start=p_start,
                    period_end=p_end,
                    estimated_monthly_sales=est_sales,
                    estimated_revenue=est_revenue,
                    category=sku.category,
                    review_based_estimate=sku.recent_reviews_30d * _revenue_estimator._get_multiplier(sku.category),
                    method_used="review_multiplier",
                    created_at=now - timedelta(days=30 * (5 - month_offset)),
                )
                db.add(se)

        await db.commit()
        logger.info("Demo data population complete.")


# ---------------------------------------------------------------------------
# Background analysis job
# ---------------------------------------------------------------------------


async def _run_analysis_job(job_id: str, url: str) -> None:
    _jobs[job_id]["status"] = "running"
    _jobs[job_id]["progress"] = 0.05
    _jobs[job_id]["step"] = "Detectando marketplace..."

    try:
        marketplace = MarketplaceDetector.detect_marketplace(url)
        if marketplace == "unknown":
            raise ValueError(f"Unrecognized marketplace URL: {url}")

        SUPPORTED_MARKETPLACES = {"mercadolivre"}
        if marketplace not in SUPPORTED_MARKETPLACES:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = (
                f"Marketplace '{marketplace}' ainda não suportado para coleta automática. "
                f"Atualmente suportado: Mercado Livre. "
                f"Shopee, Amazon, Magalu e Americanas estão em desenvolvimento."
            )
            return

        _jobs[job_id]["progress"] = 0.10
        _jobs[job_id]["step"] = f"Conectando à API do {marketplace}..."
        scraper = ScraperFactory.get_scraper(marketplace)

        async with AsyncSessionLocal() as db:
            seller_info = await scraper.get_seller_info(url)
            _jobs[job_id]["progress"] = 0.20

            seller_id_raw = seller_info.get("seller_id", url)
            seller_name = seller_info.get("seller_name", str(seller_id_raw))

            # Upsert seller
            stmt = select(Seller).where(Seller.seller_id == str(seller_id_raw))
            res = await db.execute(stmt)
            seller = res.scalars().first()

            if not seller:
                seller = Seller(
                    id=str(uuid.uuid4()),
                    seller_id=str(seller_id_raw),
                    seller_name=seller_name,
                    marketplace=marketplace,
                    store_url=url,
                    total_skus=0,
                    categories=[],
                    avg_rating=0.0,
                    avg_price=0.0,
                    is_target=True,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(seller)
                await db.flush()

            _jobs[job_id]["progress"] = 0.30
            _jobs[job_id]["step"] = f"Coletando SKUs de {seller_name}..."

            skus_raw = await scraper.get_seller_skus(str(seller_id_raw), max_pages=5, store_url=url)
            _jobs[job_id]["progress"] = 0.60
            _jobs[job_id]["step"] = "Calculando métricas e concorrentes..."

            prices: list[float] = []
            ratings: list[float] = []
            categories_set: set[str] = set()

            for sku_data in skus_raw:
                sku = SKU(
                    id=str(uuid.uuid4()),
                    sku_id=sku_data.get("sku_id", ""),
                    ean=sku_data.get("ean"),
                    title=sku_data.get("title", ""),
                    category=sku_data.get("category", ""),
                    subcategory=sku_data.get("subcategory", ""),
                    seller_id=seller.id,
                    seller_name=seller.seller_name,
                    price_current=float(sku_data.get("price_current", 0)),
                    price_original=sku_data.get("price_original"),
                    rating=float(sku_data.get("rating", 0)),
                    review_count=int(sku_data.get("review_count", 0)),
                    recent_reviews_30d=int(sku_data.get("recent_reviews_30d", 0)),
                    sales_rank=sku_data.get("sales_rank"),
                    badges=sku_data.get("badges", []),
                    marketplace=marketplace,
                    last_updated=datetime.now(timezone.utc),
                    estimated_monthly_sales=_revenue_estimator.estimate_monthly_sales(sku_data),
                    stock_status=sku_data.get("stock_status", "in_stock"),
                    created_at=datetime.now(timezone.utc),
                )
                db.add(sku)
                prices.append(sku.price_current)
                if sku.rating > 0:
                    ratings.append(sku.rating)
                categories_set.add(sku.category)

                await _price_tracker.record_price(db, sku.id, seller.seller_id, sku.price_current, marketplace)

            seller.total_skus = len(skus_raw)
            seller.categories = list(categories_set)
            seller.avg_price = round(sum(prices) / len(prices), 2) if prices else 0
            seller.avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0
            seller.updated_at = datetime.now(timezone.utc)

            await db.commit()
            _jobs[job_id]["progress"] = 1.0
            _jobs[job_id]["status"] = "completed"
            _jobs[job_id]["step"] = "Análise concluída!"
            _jobs[job_id]["result"] = {
                "seller_id": seller.seller_id,
                "seller_name": seller.seller_name,
                "marketplace": marketplace,
                "total_skus": len(skus_raw),
            }

    except Exception as exc:
        logger.exception("Analysis job %s failed", job_id)
        _jobs[job_id]["status"] = "failed"
        _jobs[job_id]["error"] = str(exc)
        _jobs[job_id]["progress"] = 0.0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _seller_to_schema(s: Seller) -> dict:
    return {
        "id": s.id,
        "seller_id": s.seller_id,
        "seller_name": s.seller_name,
        "marketplace": s.marketplace,
        "store_url": s.store_url,
        "total_skus": s.total_skus,
        "categories": s.categories or [],
        "avg_rating": s.avg_rating,
        "avg_price": s.avg_price,
        "is_target": s.is_target,
        "created_at": s.created_at.isoformat(),
        "updated_at": s.updated_at.isoformat(),
    }


def _sku_to_schema(s: SKU) -> dict:
    return {
        "id": s.id,
        "sku_id": s.sku_id,
        "ean": s.ean,
        "title": s.title,
        "category": s.category,
        "subcategory": s.subcategory,
        "seller_id": s.seller_id,
        "seller_name": s.seller_name,
        "price_current": s.price_current,
        "price_original": s.price_original,
        "rating": s.rating,
        "review_count": s.review_count,
        "recent_reviews_30d": s.recent_reviews_30d,
        "sales_rank": s.sales_rank,
        "badges": s.badges or [],
        "marketplace": s.marketplace,
        "last_updated": s.last_updated.isoformat(),
        "estimated_monthly_sales": s.estimated_monthly_sales,
        "stock_status": s.stock_status,
        "created_at": s.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Routes — Analysis Jobs
# ---------------------------------------------------------------------------


@app.post("/api/analyze", response_model=JobResponse)
async def start_analysis(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """Start a background analysis job for a seller URL."""
    # Prevent duplicate analysis for the same store URL
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(Seller).where(Seller.store_url == request.url))
        seller = existing.scalars().first()
        if seller:
            return {
                "job_id": "existing",
                "status": "completed",
                "progress": 1.0,
                "result": {
                    "seller_id": seller.seller_id,
                    "seller_name": seller.seller_name,
                    "marketplace": seller.marketplace,
                    "total_skus": seller.total_skus,
                },
                "error": None,
                "step": "Análise concluída!",
            }

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0.0,
        "result": None,
        "error": None,
        "step": None,
    }
    background_tasks.add_task(_run_analysis_job, job_id, request.url)
    return _jobs[job_id]


@app.get("/api/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    """Get the status of an analysis job."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/marketplaces/status")
async def get_marketplace_status():
    """Return which marketplaces are supported for automatic data collection."""
    return {
        "supported": [
            {"id": "mercadolivre", "name": "Mercado Livre", "status": "active", "icon": "🟢"}
        ],
        "coming_soon": [
            {"id": "shopee", "name": "Shopee", "status": "development", "icon": "🟡"},
            {"id": "amazon", "name": "Amazon BR", "status": "development", "icon": "🟡"},
            {"id": "magalu", "name": "Magazine Luiza", "status": "development", "icon": "🟡"},
            {"id": "americanas", "name": "Americanas", "status": "development", "icon": "🟡"},
        ],
    }


# ---------------------------------------------------------------------------
# Routes — Sellers
# ---------------------------------------------------------------------------


@app.get("/api/sellers")
async def list_sellers(db: AsyncSession = Depends(get_db)):
    """List all analyzed sellers."""
    stmt = select(Seller).order_by(Seller.seller_name)
    result = await db.execute(stmt)
    sellers = result.scalars().all()
    return [_seller_to_schema(s) for s in sellers]


@app.get("/api/sellers/{seller_id}")
async def get_seller(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Get detailed info for a specific seller."""
    stmt = select(Seller).where(Seller.seller_id == seller_id)
    result = await db.execute(stmt)
    seller = result.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return _seller_to_schema(seller)


@app.delete("/api/sellers/{seller_id}", status_code=204)
async def delete_seller(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a seller and all associated data by seller_id."""
    stmt = select(Seller).where(Seller.seller_id == seller_id)
    result = await db.execute(stmt)
    seller = result.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    await db.delete(seller)


# ---------------------------------------------------------------------------
# Routes — Competitors
# ---------------------------------------------------------------------------


@app.get("/api/competitors/{seller_id}")
async def get_competitors(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Return direct and indirect competitors for a seller."""
    # Resolve internal seller id
    seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
    seller_res = await db.execute(seller_stmt)
    seller = seller_res.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    # Fetch all SKUs with seller info
    all_skus_stmt = select(SKU)
    all_skus_res = await db.execute(all_skus_stmt)
    all_skus = all_skus_res.scalars().all()

    # Build flat list with seller_id field pointing to internal id
    skus_flat = [
        {
            "sku_id": s.sku_id,
            "ean": s.ean,
            "title": s.title,
            "category": s.category,
            "price_current": s.price_current,
            "seller_id": s.seller_id,
            "seller_name": s.seller_name,
            "estimated_monthly_sales": s.estimated_monthly_sales,
            "review_count": s.review_count,
            "rating": s.rating,
        }
        for s in all_skus
    ]

    competitor_result = _competitor_finder.find_competitors(seller.id, skus_flat)

    return {
        "target_seller_id": seller_id,
        "total_target_skus": competitor_result.total_target_skus,
        "direct_competitors": [
            {
                "seller_id": c.seller_id,
                "seller_name": c.seller_name,
                "overlap_count": c.overlap_count,
                "overlap_pct": c.overlap_pct,
                "relationship": c.relationship,
                "shared_skus": c.shared_skus[:10],
            }
            for c in competitor_result.direct_competitors
        ],
        "indirect_competitors": [
            {
                "seller_id": c.seller_id,
                "seller_name": c.seller_name,
                "overlap_count": c.overlap_count,
                "overlap_pct": c.overlap_pct,
                "relationship": c.relationship,
                "shared_skus": c.shared_skus[:5],
            }
            for c in competitor_result.indirect_competitors
        ],
    }


@app.get("/api/competitors/{seller_id}/gap")
async def get_portfolio_gap(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Return SKUs competitors sell that the target seller doesn't."""
    seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
    seller_res = await db.execute(seller_stmt)
    seller = seller_res.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    all_sellers_stmt = select(Seller).where(Seller.seller_id != seller_id)
    all_sellers_res = await db.execute(all_sellers_stmt)
    other_sellers = all_sellers_res.scalars().all()
    competitor_ids = [s.id for s in other_sellers]

    gaps = await _sku_analysis.get_portfolio_gap(db, seller.id, competitor_ids)
    return {"seller_id": seller_id, "gaps": gaps, "total_gaps": len(gaps)}


# ---------------------------------------------------------------------------
# Routes — SKUs
# ---------------------------------------------------------------------------


@app.get("/api/skus")
async def list_skus(
    seller_id: str | None = Query(None),
    category: str | None = Query(None),
    marketplace: str | None = Query(None),
    min_price: float | None = Query(None),
    max_price: float | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List SKUs with optional filters."""
    stmt = select(SKU)

    if seller_id:
        seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
        seller_res = await db.execute(seller_stmt)
        seller = seller_res.scalars().first()
        if seller:
            stmt = stmt.where(SKU.seller_id == seller.id)

    if category:
        stmt = stmt.where(SKU.category.ilike(f"%{category}%"))
    if marketplace:
        stmt = stmt.where(SKU.marketplace == marketplace)
    if min_price is not None:
        stmt = stmt.where(SKU.price_current >= min_price)
    if max_price is not None:
        stmt = stmt.where(SKU.price_current <= max_price)

    # Total count
    count_res = await db.execute(stmt)
    total = len(count_res.scalars().all())

    # Paginate
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    skus = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": math.ceil(total / limit) if total else 1,
        "items": [_sku_to_schema(s) for s in skus],
    }


@app.get("/api/skus/{sku_id}")
async def get_sku(sku_id: str, db: AsyncSession = Depends(get_db)):
    """Get details for a specific SKU by internal id or sku_id."""
    stmt = select(SKU).where((SKU.id == sku_id) | (SKU.sku_id == sku_id))
    result = await db.execute(stmt)
    sku = result.scalars().first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")
    return _sku_to_schema(sku)


@app.get("/api/skus/{sku_id}/price-history")
async def get_sku_price_history(
    sku_id: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Get price history for a SKU."""
    # Resolve to internal id
    stmt = select(SKU).where((SKU.id == sku_id) | (SKU.sku_id == sku_id))
    result = await db.execute(stmt)
    sku = result.scalars().first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    history = await _price_tracker.get_price_history(db, sku.id, days)
    return {
        "sku_id": sku_id,
        "days": days,
        "data_points": len(history),
        "history": history,
    }


@app.get("/api/skus/{sku_id}/competitors")
async def get_sku_competitors(sku_id: str, db: AsyncSession = Depends(get_db)):
    """Get other sellers listing the same or similar product."""
    stmt = select(SKU).where((SKU.id == sku_id) | (SKU.sku_id == sku_id))
    result = await db.execute(stmt)
    sku = result.scalars().first()
    if not sku:
        raise HTTPException(status_code=404, detail="SKU not found")

    share = await _ranking_service.get_seller_market_share(db, sku.sku_id)
    return share


# ---------------------------------------------------------------------------
# Routes — Dashboard
# ---------------------------------------------------------------------------


@app.get("/api/dashboard/{seller_id}")
async def get_dashboard(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Full dashboard KPIs and summary for a seller."""
    seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
    seller_res = await db.execute(seller_stmt)
    seller = seller_res.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    # Portfolio analysis
    portfolio = await _sku_analysis.analyze_portfolio(db, seller.id)

    # Revenue
    rev_data = await _revenue_estimator.estimate_seller_revenue(db, seller.id, period_days=30)
    prev_rev_data = await _revenue_estimator.estimate_seller_revenue(db, seller.id, period_days=60)
    prev_monthly = prev_rev_data["total_estimated_revenue"] / 2
    current_monthly = rev_data["total_estimated_revenue"]
    revenue_change_pct = (
        ((current_monthly - prev_monthly) / prev_monthly * 100) if prev_monthly > 0 else 0.0
    )

    # Price alerts
    alerts = await _price_tracker.get_price_alerts(db)
    seller_alerts = [a for a in alerts if a["seller_id"] == seller.seller_id]

    # Competitors (lightweight count)
    all_skus_res = await db.execute(select(SKU))
    all_skus = all_skus_res.scalars().all()
    skus_flat = [
        {
            "sku_id": s.sku_id,
            "ean": s.ean,
            "title": s.title,
            "category": s.category,
            "price_current": s.price_current,
            "seller_id": s.seller_id,
            "seller_name": s.seller_name,
            "estimated_monthly_sales": s.estimated_monthly_sales,
            "review_count": s.review_count,
            "rating": s.rating,
        }
        for s in all_skus
    ]
    comp_result = _competitor_finder.find_competitors(seller.id, skus_flat)

    # Competitiveness index: composite score
    top_cat_entry = portfolio["categories"][0] if portfolio["categories"] else {}
    top_cat = top_cat_entry.get("category", "—")
    avg_overlap = (
        sum(c.overlap_pct for c in comp_result.direct_competitors) / len(comp_result.direct_competitors)
        if comp_result.direct_competitors
        else 0
    )
    competitiveness_index = round(
        min(100, portfolio.get("avg_rating", 0) / 5 * 40 + (100 - avg_overlap) * 0.4 + 20), 2
    )

    return {
        "seller_id": seller_id,
        "seller_name": seller.seller_name,
        "marketplace": seller.marketplace,
        "kpis": {
            "total_skus": portfolio["total_skus"],
            "total_estimated_revenue": current_monthly,
            "avg_price": portfolio["avg_price"],
            "avg_rating": portfolio["avg_rating"],
            "direct_competitors_count": len(comp_result.direct_competitors),
            "indirect_competitors_count": len(comp_result.indirect_competitors),
            "price_alerts_count": len(seller_alerts),
            "competitiveness_index": competitiveness_index,
            "top_category": top_cat,
            "revenue_vs_last_month_pct": round(revenue_change_pct, 2),
        },
        "category_breakdown": portfolio["categories"],
        "top_skus": portfolio["top_skus"][:5],
        "recent_alerts": seller_alerts[:5],
    }


@app.get("/api/dashboard/{seller_id}/alerts")
async def get_dashboard_alerts(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Return price alerts and market alerts for a seller."""
    seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
    seller_res = await db.execute(seller_stmt)
    seller = seller_res.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    price_alerts = await _price_tracker.get_price_alerts(db)
    price_changes = await _price_tracker.detect_price_changes(db, threshold_pct=10.0)

    # Market alerts: new entrants in seller's categories
    portfolio = await _sku_analysis.analyze_portfolio(db, seller.id)
    categories = [c["category"] for c in portfolio["categories"]]
    new_entrants = await _trend_service.get_new_entrants(db, days=14)
    market_alerts = [
        e for e in new_entrants
        if e.get("category") in categories and e.get("seller_id") != seller.id
    ][:10]

    return {
        "seller_id": seller_id,
        "price_alerts": price_alerts[:20],
        "significant_price_changes": price_changes[:20],
        "market_alerts": [
            {
                "alert_type": "new_entrant",
                "title": e["title"],
                "category": e["category"],
                "seller_name": e["seller_name"],
                "adhesion_score": e["adhesion_score"],
                "severity": "medium",
                "message": f"Novo produto de alto potencial em {e['category']}: {e['title'][:50]}",
            }
            for e in market_alerts
        ],
    }


# ---------------------------------------------------------------------------
# Routes — Rankings
# ---------------------------------------------------------------------------


@app.get("/api/rankings/top-products")
async def get_top_products(
    limit: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    marketplace: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Return top products ranked by adhesion score."""
    products = await _ranking_service.get_top_products(db, limit=limit, category=category, marketplace=marketplace)
    return {"total": len(products), "items": products}


@app.get("/api/rankings/adhesion")
async def get_adhesion_scores(
    category: str | None = Query(None),
    marketplace: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Return adhesion scores for products."""
    products = await _ranking_service.get_top_products(db, limit=limit, category=category, marketplace=marketplace)
    return {
        "total": len(products),
        "items": [
            {
                "sku_id": p["sku_id"],
                "title": p["title"],
                "category": p["category"],
                "adhesion_score": p["adhesion_score"],
                "estimated_monthly_sales": p["estimated_monthly_sales"],
                "seller_name": p["seller_name"],
            }
            for p in products
        ],
    }


# ---------------------------------------------------------------------------
# Routes — Revenue
# ---------------------------------------------------------------------------

PERIOD_MAP = {
    "monthly": 30,
    "quarterly": 90,
    "semiannual": 180,
    "annual": 365,
}


@app.get("/api/revenue/{seller_id}")
async def get_seller_revenue(
    seller_id: str,
    period: str = Query("monthly", pattern="^(monthly|quarterly|semiannual|annual)$"),
    db: AsyncSession = Depends(get_db),
):
    """Return revenue estimates for a seller."""
    seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
    seller_res = await db.execute(seller_stmt)
    seller = seller_res.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    period_days = PERIOD_MAP.get(period, 30)
    data = await _revenue_estimator.estimate_seller_revenue(db, seller.id, period_days=period_days)
    top_skus = await _revenue_estimator.get_top_revenue_skus(db, seller.id, limit=20)
    data["top_revenue_skus"] = top_skus
    return data


@app.get("/api/revenue/compare")
async def compare_revenue(
    seller_ids: str = Query(..., description="Comma-separated seller IDs"),
    period: str = Query("monthly", pattern="^(monthly|quarterly|semiannual|annual)$"),
    db: AsyncSession = Depends(get_db),
):
    """Compare revenue estimates across multiple sellers."""
    ids = [s.strip() for s in seller_ids.split(",") if s.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="At least one seller_id required")

    # Resolve to internal IDs
    internal_ids: list[str] = []
    for sid in ids:
        stmt = select(Seller).where(Seller.seller_id == sid)
        res = await db.execute(stmt)
        seller = res.scalars().first()
        if seller:
            internal_ids.append(seller.id)

    period_days = PERIOD_MAP.get(period, 30)
    comparison = await _revenue_estimator.compare_sellers_revenue(db, internal_ids, period_days=period_days)
    return comparison


# ---------------------------------------------------------------------------
# Routes — Trends
# ---------------------------------------------------------------------------


@app.get("/api/trends/rising")
async def get_rising_trends(
    days: int = Query(60, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Return products with accelerating growth."""
    trending = await _trend_service.get_trending_products(db, days=days)
    return {"total": len(trending), "days": days, "items": trending}


@app.get("/api/trends/declining")
async def get_declining_trends(
    days: int = Query(60, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Return products losing momentum."""
    declining = await _trend_service.get_declining_products(db, days=days)
    return {"total": len(declining), "days": days, "items": declining}


@app.get("/api/trends/new-entrants")
async def get_new_entrants(
    days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Return new SKUs with high adhesion scores."""
    entrants = await _trend_service.get_new_entrants(db, days=days)
    return {"total": len(entrants), "days": days, "items": entrants}


@app.get("/api/trends/monthly/{seller_id}")
async def get_monthly_trends(
    seller_id: str,
    year: int = Query(..., ge=2020, le=2030),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
):
    """Return top 10 SKUs for a seller in a specific month."""
    seller_stmt = select(Seller).where(Seller.seller_id == seller_id)
    seller_res = await db.execute(seller_stmt)
    seller = seller_res.scalars().first()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    ranking = await _trend_service.get_monthly_ranking(db, seller.id, year, month)
    return {"seller_id": seller_id, "year": year, "month": month, "ranking": ranking}


# ---------------------------------------------------------------------------
# Routes — Matrix
# ---------------------------------------------------------------------------


@app.get("/api/matrix/price-volume")
async def get_price_volume_matrix(
    seller_id: str | None = Query(None),
    category: str | None = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Return price × volume data for scatter matrix visualization."""
    stmt = select(SKU)

    if seller_id:
        sel_stmt = select(Seller).where(Seller.seller_id == seller_id)
        sel_res = await db.execute(sel_stmt)
        seller = sel_res.scalars().first()
        if seller:
            stmt = stmt.where(SKU.seller_id == seller.id)

    if category:
        stmt = stmt.where(SKU.category.ilike(f"%{category}%"))

    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = stmt.where(SKU.last_updated >= since)

    result = await db.execute(stmt)
    skus = result.scalars().all()

    return {
        "seller_id": seller_id,
        "category": category,
        "days": days,
        "data": [
            {
                "sku_id": s.sku_id,
                "title": s.title[:60],
                "category": s.category,
                "price": s.price_current,
                "volume": s.estimated_monthly_sales,
                "revenue": round(s.estimated_monthly_sales * s.price_current, 2),
                "rating": s.rating,
                "seller_name": s.seller_name,
            }
            for s in skus
        ],
    }


@app.get("/api/matrix/heatmap")
async def get_price_heatmap(
    db: AsyncSession = Depends(get_db),
):
    """Return price competitiveness heatmap by category and seller."""
    stmt = select(SKU)
    result = await db.execute(stmt)
    all_skus = result.scalars().all()

    # Group by category
    by_cat: dict[str, list[SKU]] = {}
    for s in all_skus:
        by_cat.setdefault(s.category, []).append(s)

    # For each category, compute avg price per seller and relative position
    heatmap: list[dict[str, Any]] = []
    for cat, skus in by_cat.items():
        cat_avg = sum(s.price_current for s in skus) / len(skus)
        by_seller: dict[str, list[float]] = {}
        for s in skus:
            by_seller.setdefault(s.seller_name, []).append(s.price_current)

        for seller_name, prices in by_seller.items():
            seller_avg = sum(prices) / len(prices)
            competitiveness = round((cat_avg - seller_avg) / cat_avg * 100, 2) if cat_avg else 0
            heatmap.append({
                "category": cat,
                "seller_name": seller_name,
                "avg_price": round(seller_avg, 2),
                "category_avg_price": round(cat_avg, 2),
                "price_competitiveness_pct": competitiveness,
                "sku_count": len(prices),
                "position": "below_market" if competitiveness > 2 else "above_market" if competitiveness < -2 else "at_market",
            })

    heatmap.sort(key=lambda x: (x["category"], x["price_competitiveness_pct"]), reverse=True)
    return {"total_entries": len(heatmap), "data": heatmap}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "tork-vision-api", "version": "1.0.0"}


@app.get("/api/debug/resolve/{nickname}")
async def debug_resolve_nickname(nickname: str):
    """Debug: test ML nickname resolution strategies."""
    from scraper.marketplace import MercadoLivreScraper
    import urllib.parse as _up
    scraper = MercadoLivreScraper()
    api_base = "https://api.mercadolibre.com"

    async def _safe_json(url: str):
        try:
            resp = await scraper._get(url)
            body = resp.json() if hasattr(resp, "json") and callable(resp.json) else {}
            return {"status": getattr(resp, "status_code", None), "body": body}
        except Exception as exc:
            return {"error": str(exc)}

    s1 = await _safe_json(f"{api_base}/sites/MLB/search?nickname={_up.quote(nickname)}&limit=2")
    s2 = await _safe_json(f"{api_base}/users/search?nickname={_up.quote(nickname)}")
    resolved = await scraper._resolve_nickname_to_id(nickname)
    user_info = await _safe_json(f"{api_base}/users/{resolved}") if resolved else None
    await scraper.close()
    return {
        "nickname": nickname,
        "resolved_id": resolved,
        "strategy1_items_search": s1,
        "strategy2_users_search": s2,
        "user_info": user_info,
    }
