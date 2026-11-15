from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from app import main
from app.physical import PhysicalTelemetry


def payload(**changes):
    result = dict(device_id='ESP32-01', source='physical-esp32', boot_id='1234abcd',
                  wifi_connected=True, wifi_rssi_dbm=-58, uptime_ms=5000, wifi_reconnects=0,
                  http_requests_completed=0, http_successes=0, http_failures=0,
                  http_payload_bytes_attempted=0, http_payload_bytes_accepted=0, last_http_status=None)
    return {**result, **changes}


def test_physical_reports_do_not_invent_features_or_call_detector(client, monkeypatch):
    def forbidden(*args):
        raise AssertionError('Physical health must not enter the network model')
    monkeypatch.setattr(main.detector, 'evaluate', forbidden)
    result = client.post('/api/physical-telemetry', json=payload())
    assert result.status_code == 201
    row = result.json()
    assert row['wifi_rssi_dbm'] == -58 and row['source'] == 'physical-esp32'
    for key in ['packet_rate', 'byte_rate', 'average_packet_size', 'destination_count', 'port_diversity', 'risk_score']:
        assert row[key] is None
    data = client.get('/api/dashboard').json()
    assert data['summary'] == {'telemetry_count': 0, 'alert_count': 0}
    assert data['physical_telemetry_count'] == 1
    assert [d['id'] for d in data['devices']] == ['esp32-01', 'esp32-02']
    assert [d['id'] for d in data['physical_devices']] == ['ESP32-01', 'ESP32-02']
    assert data['physical_devices'][0]['last_seen_status'] == 'recent'
    assert data['physical_devices'][1]['last_seen_status'] == 'never_seen'


def test_counters_and_both_physical_ids_persist(client):
    for device_id in ['ESP32-01', 'ESP32-02']:
        result = client.post('/api/physical-telemetry', json=payload(
            device_id=device_id, http_requests_completed=4, http_successes=3, http_failures=1,
            http_payload_bytes_attempted=1400, http_payload_bytes_accepted=1000, last_http_status=201))
        assert result.status_code == 201
    with main.Session() as session:
        rows = session.scalars(select(PhysicalTelemetry)).all()
        assert len(rows) == 2
        assert rows[1].http_requests_completed == 4
        assert rows[1].http_payload_bytes_accepted == 1000


@pytest.mark.parametrize('changes', [
    {'device_id': 'esp32-01'}, {'device_id': 'ESP32-03'}, {'source': 'synthetic'},
    {'packet_count': 0}, {'destination_count': 1}, {'risk_score': 0},
    {'wifi_rssi_dbm': -200}, {'wifi_rssi_dbm': None},
    {'wifi_connected': False}, {'uptime_ms': -1}, {'uptime_ms': '5000'},
    {'http_successes': 1}, {'http_payload_bytes_accepted': 10},
    {'boot_id': 'invalid'}, {'last_http_status': 201},
])
def test_rejects_invalid_or_fabricated_fields(client, changes):
    assert client.post('/api/physical-telemetry', json=payload(**changes)).status_code == 422


def test_disconnected_sample_does_not_claim_live_connectivity(client):
    assert client.post('/api/physical-telemetry', json=payload(wifi_connected=False, wifi_rssi_dbm=None)).status_code == 201
    with main.Session.begin() as session:
        row = session.scalar(select(PhysicalTelemetry))
        row.timestamp = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    device = client.get('/api/dashboard').json()['physical_devices'][0]
    assert device['last_seen_status'] == 'stale'
    assert device['latest']['wifi_connected'] is False
    assert device['latest']['wifi_rssi_dbm'] is None


def test_optional_device_key(client, monkeypatch):
    monkeypatch.setenv('DEVICE_API_KEY', 'test-only-key')
    assert client.post('/api/physical-telemetry', json=payload()).status_code == 401
    assert client.post('/api/physical-telemetry', json=payload(), headers={'X-API-Key': 'wrong'}).status_code == 401
    assert client.post('/api/physical-telemetry', json=payload(), headers={'X-API-Key': 'test-only-key'}).status_code == 201
    assert client.get('/api/dashboard').status_code == 200
    assert client.post('/api/demo', json={'action': 'stop'}).status_code == 200


def test_additive_startup_preserves_existing_records_and_legacy_api(client):
    legacy = dict(device_id='esp32-01', source='synthetic', window_seconds=3,
                  packet_count=900, byte_count=1200000, destination_count=40, port_diversity=30)
    before = client.post('/api/telemetry', json=legacy).json()
    client.post('/api/physical-telemetry', json=payload())
    main.Base.metadata.create_all(main.engine)
    main.PhysicalBase.metadata.create_all(main.engine)
    after = client.get('/api/dashboard').json()
    assert after['telemetry'][0] == before
    assert after['summary'] == {'telemetry_count': 1, 'alert_count': 1}
    assert after['physical_telemetry_count'] == 1
