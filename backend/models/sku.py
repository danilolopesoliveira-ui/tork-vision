import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class SKU(Base):
    __tablename__ = "skus"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sku_id: Mapped[str] = mapped_column(String(128), index=True)
    ean: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512))
    category: Mapped[str] = mapped_column(String(128), index=True)
    subcategory: Mapped[str] = mapped_column(String(128))

    seller_id: Mapped[str] = mapped_column(String(36), ForeignKey("sellers.id"), index=True)
    seller_name: Mapped[str] = mapped_column(String(256))

    price_current: Mapped[float] = mapped_column(Float)
    price_original: Mapped[float | None] = mapped_column(Float, nullable=True)

    rating: Mapped[float] = mapped_column(Float, default=0.0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    recent_reviews_30d: Mapped[int] = mapped_column(Integer, default=0)
    sales_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)

    badges: Mapped[list] = mapped_column(JSON, default=list)
    marketplace: Mapped[str] = mapped_column(String(64), index=True)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    estimated_monthly_sales: Mapped[int] = mapped_column(Integer, default=0)
    stock_status: Mapped[str] = mapped_column(String(64), default="in_stock")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    seller: Mapped["Seller"] = relationship("Seller", back_populates="skus")  # type: ignore[name-defined]
    price_histories: Mapped[list["PriceHistory"]] = relationship(  # type: ignore[name-defined]
        "PriceHistory", back_populates="sku", cascade="all, delete-orphan"
    )
    sales_estimates: Mapped[list["SalesEstimate"]] = relationship(  # type: ignore[name-defined]
        "SalesEstimate", back_populates="sku", cascade="all, delete-orphan"
    )
