import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Float, Integer, DateTime, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class SalesEstimate(Base):
    __tablename__ = "sales_estimates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    sku_id: Mapped[str] = mapped_column(String(36), ForeignKey("skus.id"), index=True)
    seller_id: Mapped[str] = mapped_column(String(128), index=True)
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    estimated_monthly_sales: Mapped[int] = mapped_column(Integer, default=0)
    estimated_revenue: Mapped[float] = mapped_column(Float, default=0.0)
    category: Mapped[str] = mapped_column(String(128))
    review_based_estimate: Mapped[int] = mapped_column(Integer, default=0)
    method_used: Mapped[str] = mapped_column(String(128), default="review_multiplier")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    sku: Mapped["SKU"] = relationship("SKU", back_populates="sales_estimates")  # type: ignore[name-defined]
