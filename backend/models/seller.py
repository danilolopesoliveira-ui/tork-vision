import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Seller(Base):
    __tablename__ = "sellers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seller_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    seller_name: Mapped[str] = mapped_column(String(256))
    marketplace: Mapped[str] = mapped_column(String(64), index=True)
    store_url: Mapped[str] = mapped_column(String(512))

    total_skus: Mapped[int] = mapped_column(Integer, default=0)
    categories: Mapped[list] = mapped_column(JSON, default=list)
    avg_rating: Mapped[float] = mapped_column(Float, default=0.0)
    avg_price: Mapped[float] = mapped_column(Float, default=0.0)

    is_target: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    skus: Mapped[list["SKU"]] = relationship("SKU", back_populates="seller")  # type: ignore[name-defined]
