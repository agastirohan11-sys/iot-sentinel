def test_end_to_end(client):
    assert client.get('/api/health').json()['status'] == 'ok'
    assert client.get('/api/dashboard').json()['summary']['telemetry_count'] == 0
    assert client.post('/api/demo', json={'action': 'invalid'}).status_code == 422
    assert client.post('/api/telemetry', json={'device_id': 'unknown'}).status_code == 422
    payload = dict(device_id='esp32-01', window_seconds=3, packet_count=60, byte_count=24000,
                   destination_count=2, port_diversity=2)
    normal = client.post('/api/telemetry', json=payload)
    assert normal.status_code == 201
    assert normal.json()['packet_rate'] == 20
    assert normal.json()['average_packet_size'] == 400
    assert normal.json()['risk_score'] < 0.4
    payload.update(packet_count=900, byte_count=1200000, destination_count=40, port_diversity=30)
    abnormal = client.post('/api/telemetry', json=payload).json()
    assert abnormal['risk_score'] >= 0.6
    assert abnormal['ml_anomaly'] and len(abnormal['reasons']) >= 4
    snapshot = client.get('/api/dashboard').json()
    assert snapshot['summary'] == {'telemetry_count': 2, 'alert_count': 1}
    assert snapshot['alerts'][0]['telemetry_id'] == abnormal['id']
    assert client.post('/api/demo', json={'action': 'abnormal'}).json()['mode'] == 'abnormal'
    assert client.post('/api/demo', json={'action': 'start'}).json()['running']
    import time
    time.sleep(3.2)
    assert client.get('/api/dashboard').json()['summary']['telemetry_count'] >= 4
    assert not client.post('/api/demo', json={'action': 'stop'}).json()['running']
    before = client.get('/api/dashboard').json()['summary']['telemetry_count']
    import time
    time.sleep(3.2)
    assert client.get('/api/dashboard').json()['summary']['telemetry_count'] == before
    payload.update(packet_count=0, byte_count=1)
    assert client.post('/api/telemetry', json=payload).status_code == 422
    payload.update(window_seconds=0)
    assert client.post('/api/telemetry', json=payload).status_code == 422
