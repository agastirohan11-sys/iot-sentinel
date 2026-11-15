import asyncio
import json
import hmac
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Float, Integer, String, create_engine, select, func
from sqlalchemy.exc import SQLAlchemyError
from fastapi.responses import JSONResponse
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .detection import Detector, normal_features
from .physical import PhysicalBase, PhysicalInput, physical_snapshot, store_physical

load_dotenv()
engine = create_engine(os.getenv('DATABASE_URL', 'sqlite:///./sentinel.db'), connect_args={'check_same_thread': False})
Session = sessionmaker(engine)


class Base(DeclarativeBase):
    pass


class Telemetry(Base):
    __tablename__ = 'telemetry'
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(String)
    timestamp: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    window_seconds: Mapped[float] = mapped_column(Float)
    packet_count: Mapped[int] = mapped_column(Integer)
    byte_count: Mapped[int] = mapped_column(Integer)
    packet_rate: Mapped[float] = mapped_column(Float)
    byte_rate: Mapped[float] = mapped_column(Float)
    average_packet_size: Mapped[float] = mapped_column(Float)
    destination_count: Mapped[int] = mapped_column(Integer)
    port_diversity: Mapped[int] = mapped_column(Integer)
    risk_score: Mapped[float] = mapped_column(Float)
    rule_score: Mapped[float] = mapped_column(Float)
    ml_score: Mapped[float] = mapped_column(Float)
    ml_anomaly: Mapped[bool] = mapped_column(Boolean)
    model_decision: Mapped[float] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String)
    reasons_json: Mapped[str] = mapped_column(String)


class Alert(Base):
    __tablename__ = 'alerts'
    id: Mapped[int] = mapped_column(primary_key=True)
    telemetry_id: Mapped[int] = mapped_column(Integer)
    device_id: Mapped[str] = mapped_column(String)
    timestamp: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    risk_score: Mapped[float] = mapped_column(Float)
    reasons_json: Mapped[str] = mapped_column(String)


DEVICES = {'esp32-01': 'Lab Environmental Sensor', 'esp32-02': 'Workshop Smart Meter'}
state = {'running': False, 'mode': 'normal', 'last_error': None}
detector = Detector()
rng = np.random.default_rng()


class TelemetryInput(BaseModel):
    device_id: Literal['esp32-01', 'esp32-02']
    source: Literal['synthetic', 'device-reported'] = 'device-reported'
    window_seconds: float = Field(ge=0.1, le=300, allow_inf_nan=False)
    packet_count: int = Field(ge=0, le=10000000)
    byte_count: int = Field(ge=0, le=10000000000)
    destination_count: int = Field(ge=0, le=100000)
    port_diversity: int = Field(ge=0, le=65536)


class DemoCommand(BaseModel):
    action: Literal['start', 'stop', 'normal', 'abnormal']


def serialize(row):
    result = {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name != 'reasons_json'}
    result['reasons'] = json.loads(row.reasons_json)
    return result


def ingest(payload):
    if payload.packet_count == 0 and payload.byte_count != 0:
        raise HTTPException(422, 'byte_count must be zero when packet_count is zero')
    features = dict(packet_rate=payload.packet_count / payload.window_seconds,
                    byte_rate=payload.byte_count / payload.window_seconds,
                    average_packet_size=payload.byte_count / max(payload.packet_count, 1),
                    destination_count=payload.destination_count, port_diversity=payload.port_diversity)
    result = detector.evaluate(features)
    reasons = result.pop('reasons')
    row = Telemetry(**payload.model_dump(), timestamp=datetime.now(timezone.utc).isoformat(),
                    **{k: v for k, v in features.items() if k not in ['destination_count', 'port_diversity']},
                    **result, reasons_json=json.dumps(reasons))
    with Session.begin() as session:
        session.add(row)
        session.flush()
        if row.risk_score >= 0.4:
            session.add(Alert(telemetry_id=row.id, device_id=row.device_id, timestamp=row.timestamp,
                              severity=row.severity, risk_score=row.risk_score, reasons_json=row.reasons_json))
        output = serialize(row)
    return output


def simulate_once():
    for device_id in DEVICES:
        rate, byte_rate, _, destinations, ports = normal_features(rng)
        if state['mode'] == 'abnormal':
            rate = float(rng.uniform(150, 450))
            byte_rate = rate * float(rng.uniform(900, 1450))
            destinations, ports = int(rng.integers(20, 60)), int(rng.integers(15, 45))
        ingest(TelemetryInput(device_id=device_id, source='synthetic', window_seconds=3,
                              packet_count=int(rate * 3), byte_count=int(byte_rate * 3),
                              destination_count=destinations, port_diversity=ports))


async def simulator():
    while True:
        if state['running']:
            try:
                simulate_once()
                state['last_error'] = None
            except Exception:
                state['running'] = False
                state['last_error'] = 'Telemetry generation failed. Check backend logs.'
                import logging
                logging.exception('Simulator failed')
        await asyncio.sleep(3)


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    PhysicalBase.metadata.create_all(engine)  # Additive only; never alters existing tables.
    task = asyncio.create_task(simulator())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title='IoT Sentinel', version='1.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(','),
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


@app.exception_handler(SQLAlchemyError)
async def database_error(request, exc):
    import logging
    logging.exception('Database operation failed', exc_info=exc)
    return JSONResponse(status_code=503, content={'detail': 'Database unavailable. Check backend logs.'})


@app.get('/api/health')
def health():
    with Session() as session:
        session.execute(select(func.count(Telemetry.id)))
    return {'status': 'ok', 'model': 'IsolationForest', 'training_samples': detector.training_samples,
            'training_data': 'synthetic normal behaviour', 'demo': state.copy()}


@app.post('/api/demo')
def demo(command: DemoCommand):
    if command.action in ['start', 'stop']:
        state['running'] = command.action == 'start'
    else:
        state['mode'] = command.action
    return state.copy()


@app.post('/api/telemetry', status_code=201)
def telemetry(payload: TelemetryInput):
    return ingest(payload)


@app.post('/api/physical-telemetry', status_code=201)
def physical_telemetry(payload: PhysicalInput, x_api_key: str | None = Header(default=None)):
    expected = os.getenv('DEVICE_API_KEY', '')
    if expected and not hmac.compare_digest(expected.encode(), (x_api_key or '').encode()):
        raise HTTPException(401, 'Invalid or missing device API key')
    return store_physical(payload, Session)


@app.get('/api/dashboard')
def dashboard():
    with Session() as session:
        latest_rows = session.scalars(select(Telemetry).order_by(Telemetry.id.desc()).limit(120)).all()
        alerts = session.scalars(select(Alert).order_by(Alert.id.desc()).limit(100)).all()
        total = session.scalar(select(func.count(Telemetry.id)))
        alert_count = session.scalar(select(func.count(Alert.id)))
        devices = []
        for device_id, name in DEVICES.items():
            latest = session.scalar(select(Telemetry).where(Telemetry.device_id == device_id).order_by(Telemetry.id.desc()).limit(1))
            devices.append({'id': device_id, 'name': name, 'latest': serialize(latest) if latest else None})
        return {**physical_snapshot(session), 'demo': state.copy(), 'devices': devices, 'telemetry': [serialize(r) for r in reversed(latest_rows)],
                'alerts': [serialize(a) for a in alerts], 'summary': {'telemetry_count': total, 'alert_count': alert_count},
                'model': {'name': 'Isolation Forest', 'training_samples': detector.training_samples,
                          'training_source': 'Synthetic normal behaviour', 'evaluation': 'No real-world accuracy evaluation performed'}}
