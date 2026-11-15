"""Physical ESP32 health reports: no inferred network features or intrusion scores."""
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Boolean, Integer, String, select, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Literal

PHYSICAL_DEVICES = {'ESP32-01': 'Physical ESP32 DevKit 01', 'ESP32-02': 'Physical ESP32 DevKit 02'}
MAX_COUNTER = 2**53 - 1  # Exact integer range in the JavaScript dashboard.


class PhysicalBase(DeclarativeBase):
    pass


class PhysicalTelemetry(PhysicalBase):
    __tablename__ = 'physical_telemetry'
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String)
    timestamp: Mapped[str] = mapped_column(String)
    boot_id: Mapped[str] = mapped_column(String)
    wifi_connected: Mapped[bool] = mapped_column(Boolean)
    wifi_rssi_dbm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uptime_ms: Mapped[int] = mapped_column(Integer)
    wifi_reconnects: Mapped[int] = mapped_column(Integer)
    http_requests_completed: Mapped[int] = mapped_column(Integer)
    http_successes: Mapped[int] = mapped_column(Integer)
    http_failures: Mapped[int] = mapped_column(Integer)
    http_payload_bytes_attempted: Mapped[int] = mapped_column(Integer)
    http_payload_bytes_accepted: Mapped[int] = mapped_column(Integer)
    last_http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PhysicalInput(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    device_id: Literal['ESP32-01', 'ESP32-02']
    source: Literal['physical-esp32']
    boot_id: str = Field(pattern=r'^[0-9a-fA-F]{8}$')
    wifi_connected: bool
    wifi_rssi_dbm: int | None = Field(default=None, ge=-127, le=0)
    uptime_ms: int = Field(ge=0, le=MAX_COUNTER)
    wifi_reconnects: int = Field(ge=0, le=MAX_COUNTER)
    http_requests_completed: int = Field(ge=0, le=MAX_COUNTER)
    http_successes: int = Field(ge=0, le=MAX_COUNTER)
    http_failures: int = Field(ge=0, le=MAX_COUNTER)
    http_payload_bytes_attempted: int = Field(ge=0, le=MAX_COUNTER)
    http_payload_bytes_accepted: int = Field(ge=0, le=MAX_COUNTER)
    last_http_status: int | None = Field(default=None, ge=-1000, le=599)

    @model_validator(mode='after')
    def consistent_counters(self):
        if self.http_successes + self.http_failures != self.http_requests_completed:
            raise ValueError('successes + failures must equal completed requests')
        if self.http_payload_bytes_accepted > self.http_payload_bytes_attempted:
            raise ValueError('accepted payload bytes cannot exceed attempted bytes')
        if self.wifi_connected != (self.wifi_rssi_dbm is not None):
            raise ValueError('RSSI is required while connected and must be null while disconnected')
        if (self.http_requests_completed == 0) != (self.last_http_status is None):
            raise ValueError('last_http_status must be null exactly when no requests have completed')
        return self


def serialize_physical(row):
    data = {column.name: getattr(row, column.name) for column in row.__table__.columns}
    data.update(source='physical-esp32', detection_status='unavailable: network features not measured',
                packet_rate=None, byte_rate=None, average_packet_size=None,
                destination_count=None, port_diversity=None, risk_score=None)
    return data


def store_physical(payload, session_factory):
    row = PhysicalTelemetry(**payload.model_dump(exclude={'source'}),
                            timestamp=datetime.now(timezone.utc).isoformat())
    with session_factory.begin() as session:
        session.add(row)
        session.flush()
        return serialize_physical(row)


def physical_snapshot(session):
    now = datetime.now(timezone.utc)
    devices = []
    for device_id, name in PHYSICAL_DEVICES.items():
        latest = session.scalar(select(PhysicalTelemetry).where(PhysicalTelemetry.device_id == device_id)
                                .order_by(PhysicalTelemetry.id.desc()).limit(1))
        age = max(0, (now - datetime.fromisoformat(latest.timestamp)).total_seconds()) if latest else None
        devices.append({'id': device_id, 'name': name, 'kind': 'physical',
                        'latest': serialize_physical(latest) if latest else None,
                        'last_seen_status': 'never_seen' if age is None else 'recent' if age <= 20 else 'stale',
                        'seconds_since_seen': round(age, 1) if age is not None else None})
    rows = session.scalars(select(PhysicalTelemetry).order_by(PhysicalTelemetry.id.desc()).limit(120)).all()
    return {'physical_devices': devices, 'physical_telemetry': [serialize_physical(row) for row in reversed(rows)],
            'physical_telemetry_count': session.scalar(select(func.count(PhysicalTelemetry.id)))}
