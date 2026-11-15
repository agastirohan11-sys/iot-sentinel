# ESP32-compatible telemetry contract

Physical firmware is deferred. This application does not capture packets from an ESP32.
A future device may POST device-reported aggregate counters to `/api/telemetry`:

```json
{
  "device_id": "esp32-01",
  "source": "device-reported",
  "window_seconds": 3,
  "packet_count": 60,
  "byte_count": 24000,
  "destination_count": 2,
  "port_diversity": 2
}
```

Counts refer to one measurement window; destinations and ports are distinct counts in that window.
The server assigns the UTC receipt timestamp and computes rates and average packet size.
`esp32-01` and `esp32-02` are the supported IDs. Demo rows explicitly use source `synthetic`.
No scanning, flooding, attack generation, or hardware capture is implemented.
