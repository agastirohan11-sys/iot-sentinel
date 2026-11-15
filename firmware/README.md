# Physical ESP32 integration — Windows + Arduino IDE

This firmware reports **genuine local device health and its own application communication counters**, every five seconds while Wi-Fi is connected. It does **not** measure other devices' traffic, capture packets, count IP destinations/ports, or generate attacks. The network anomaly model cannot score these health reports and explicitly returns null network features/risk. Synthetic demo functionality remains independent.

**Hardware status:** no ESP32 boards are attached to the cloud workspace. Upload, RF behaviour, power stability, and physical reconnection must be verified on your boards. The firmware uses the WiFi/HTTPClient libraries included in Arduino-ESP32; no third-party Arduino JSON library is needed. Cloud compilation could not be completed because official SDK index downloads were blocked. Run the Arduino IDE Verify step below on your laptop before upload.

## 1. Start the backend on your Windows laptop's LAN interface

Keep the laptop and both boards on the same **2.4 GHz Wi-Fi** network (classic ESP32 does not support 5 GHz). Disable guest/client isolation for that network if it prevents device-to-laptop communication. A 2.4 GHz Windows mobile hotspot is an alternative when supported by the laptop.

Open PowerShell in the project root. If the software MVP is already installed, reuse its `.venv` and SQLite file:

```powershell
ipconfig
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Read the **IPv4 Address of the active Wi-Fi adapter** in `ipconfig` (for example `192.168.1.100`). Do not use the default gateway, VPN/virtual adapter address, `127.0.0.1`, or `0.0.0.0` as the firmware destination. Use the laptop's current address; DHCP can change it. A router DHCP reservation can keep it stable.

In another PowerShell window, replace the example IP with the laptop's real Wi-Fi IP:

```powershell
Invoke-RestMethod http://192.168.1.100:8000/api/health
```

If Windows Firewall prompts for Python, allow it on your **Private network**. If no prompt appears and LAN requests fail, open **Windows Defender Firewall with Advanced Security → Inbound Rules → New Rule → Port → TCP → Specific local ports: 8000 → Allow the connection → Private only → name: IoT Sentinel ESP32**. In that rule's **Properties → Scope**, restrict remote addresses to **Local subnet**. Use this only on a trusted private LAN; do not disable the firewall or forward port 8000 on your router. A laptop self-request does not prove the boards can reach it: check board HTTP results too.

The application adds a new `physical_telemetry` table on startup. It does not alter/drop existing `telemetry` or `alerts` tables. **Do not delete `backend/sentinel.db`**. Continue starting the backend from `backend/` to retain the same relative database path.

Start the dashboard in another PowerShell window from the project root:

```powershell
Set-Location frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173` on the laptop. Overview and Devices contain a separate **Physical ESP32 devices** panel. The existing charts, alerts, and demo controls retain their original network-counter data.

## 2. Configure credentials safely

Copy `firmware/iot_sentinel/config.example.h` to **`firmware/iot_sentinel/config.h`** in the same directory. For example, from the project root:

```powershell
Copy-Item firmware\iot_sentinel\config.example.h firmware\iot_sentinel\config.h
```

Do this once; preserve any existing local config. Edit `config.h`:

| Setting | Value |
|---|---|
| `WIFI_SSID` | Your 2.4 GHz network name |
| `WIFI_PASSWORD` | Its password |
| `BACKEND_HOST` | Laptop Wi-Fi IPv4 only, e.g. `192.168.1.100` |
| `BACKEND_PORT` | `8000` |
| `DEVICE_ID` | `ESP32-01` for board 1, `ESP32-02` for board 2 |
| `DEVICE_API_KEY` | Empty by default, or the optional backend device key |

`config.h` is Git-ignored. Never put real credentials in `config.example.h`, `.ino`, screenshots, or commits. Verify with `git check-ignore firmware/iot_sentinel/config.h`. JSON reports and Serial output do not include Wi-Fi credentials or the API key. Uploaded firmware binaries can contain your credentials: do not share them.

### Optional device ingestion key

Set a random local `DEVICE_API_KEY` in your existing root `.env` (or the backend process environment), and set the same value in each board's local `config.h`. `.env.example` contains an empty placeholder. Restart the backend and re-upload firmware after changing the key. Requests to `/api/physical-telemetry` must then include `X-API-Key`; mismatches return 401. Leave it empty on both ends to disable this check.

This is a shared ingestion key, not full application authentication or hardware attestation. The HTTP transport is unencrypted, so use only a trusted LAN. The dashboard, simulator controls and legacy endpoints are unchanged and have no new authentication. Do not expose the backend to the public Internet.

## 3. Install Arduino IDE and ESP32 board support

1. Install **Arduino IDE 2.x** from `https://www.arduino.cc/en/software`.
2. Open **File → Preferences → Additional boards manager URLs**. Add:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   Keep any existing URLs, then click OK.
3. Open **Tools → Board → Boards Manager**. Search **esp32** and install **esp32 by Espressif Systems**, stable **3.x**.
4. Connect **one** ESP32 DevKit using a **USB data cable**. Use Device Manager → Ports (COM & LPT) to identify its COM port. If missing, check the cable and install the USB-UART driver matching the board's chip (CP210x from Silicon Labs or CH340 from WCH, using the manufacturer's official driver).
5. Open **File → Open → `firmware/iot_sentinel/iot_sentinel.ino`**. The folder name must remain `iot_sentinel` to match the sketch. `config.h` must be beside it.
6. Select **Tools → Board → esp32 → ESP32 Dev Module** for a classic ESP32-WROOM DevKit. If your board is labelled ESP32-S3/C3 or another variant, select its exact matching board instead. Select **Tools → Port → COMx**. Set **Upload Speed → 115200** for a conservative starting point; keep other board defaults for the matching board.
7. Confirm `DEVICE_ID` is **ESP32-01**, with Wi-Fi and laptop settings filled in locally. Click **Verify (✓)**, then **Upload (→)**.
8. If upload remains at “Connecting…”, hold **BOOT** until writing starts, then release. If required, briefly press **EN/RESET** while holding BOOT. Do not erase flash as a routine troubleshooting step. Close any other application using the COM port.
9. Open **Tools → Serial Monitor**, set **115200 baud**, then press **EN/RESET**. Expect a boot ID, connection progress, local Wi-Fi IP and a result such as `HTTP result=201` every approximately five seconds.
10. Disconnect board 1, connect board 2, change only `DEVICE_ID` to **ESP32-02** in local `config.h`, select board 2's COM port, and repeat Verify/Upload. Existing firmware on board 1 retains ESP32-01. Label the physical boards; changing the local file does not reconfigure a board until uploaded.
11. Power both boards by USB and inspect each COM port in separate Serial Monitor windows/IDE instances if desired. No external sensors or wiring are required.

If you later re-upload board 1, restore `DEVICE_ID` to ESP32-01 first. Avoid flashing both boards with the same ID: last-report display would alternate between them.

## 4. Payload and counter semantics

`POST /api/physical-telemetry` uses uppercase physical IDs, distinct from the existing lowercase demo IDs (`esp32-01`, `esp32-02`). Example **schema illustration only**, not a real hardware sample:

```json
{
  "device_id": "ESP32-01",
  "source": "physical-esp32",
  "boot_id": "1234abcd",
  "wifi_connected": true,
  "wifi_rssi_dbm": -58,
  "uptime_ms": 5000,
  "wifi_reconnects": 0,
  "http_requests_completed": 0,
  "http_successes": 0,
  "http_failures": 0,
  "http_payload_bytes_attempted": 0,
  "http_payload_bytes_accepted": 0,
  "last_http_status": null
}
```

- **RSSI:** `WiFi.RSSI()` in dBm, sampled only while connected. The API accepts null RSSI only for explicitly disconnected samples. This firmware does not buffer offline samples.
- **Uptime:** `esp_timer_get_time()` converted to milliseconds, since boot; a reboot resets counters and changes the random boot/session ID. The boot ID is not a security identity.
- **Connectivity:** the device's Wi-Fi status at sampling time. Once offline it cannot send a report. The server marks reports older than **20 seconds** as **stale / connectivity unknown**, not definitively offline and not still confirmed connected. Wi-Fi health is not an intrusion signal.
- **Wi-Fi reconnects:** observed transitions back to connected after the initial connection. This is not every radio-level disconnect/retry.
- **HTTP counters:** cumulative since boot; every payload contains completed attempts **before the current request**. Thus the first report normally has all-zero counters, and a failure appears in a later successfully delivered report. Success means an HTTP 2xx; failure means any other HTTP status or local transport failure. These are this firmware's requests only.
- **Payload bytes attempted:** UTF-8 JSON body bytes handed to HTTPClient for POST attempts, even if the transport fails. These are not proof of transmission, nor total network/wire bytes.
- **Payload bytes accepted:** JSON body bytes for requests whose response was HTTP 2xx. An interrupted response can mean the server stored data but the board cannot count that attempt as accepted. No deduplication/replay protocol is implemented.
- **Last HTTP result:** previous completed attempt's HTTP status, a negative Arduino HTTPClient transport code, or local `-1000` if request initialization failed. Null before the first attempt completes.
- **Not measured:** packet counts/rates, total wire bytes, average network packet size, destination count and port diversity. They are **not** populated with zeros or HTTP counters. The API rejects these fields in physical reports, returns them and risk as null, and bypasses rule/ML network detection. No physical network anomaly alert is generated from this firmware.

The server assigns UTC receipt timestamps. Reports are scheduled every five seconds while connected; connection and HTTP timeouts can delay them. Missed reports are not fabricated or replayed. The API identifies a self-reported source, not cryptographically verified physical hardware. Original `/api/telemetry` aggregate-counter payloads, tables, simulator and model are unchanged.

## 5. Physical-device verification checklist (perform on your hardware)

- [ ] Backend `/api/health` responds on the laptop LAN IP, and Windows firewall allows only the intended private LAN.
- [ ] Board 1 Serial Monitor identifies ESP32-01 and board 2 identifies ESP32-02.
- [ ] Both connect to the intended 2.4 GHz network without printing credentials.
- [ ] Each reports HTTP **201** about every five seconds. 401 means check optional key; 422 means schema mismatch; negative codes mean check connectivity, IP, server and firewall.
- [ ] With **Stop Demo** selected, both uppercase physical devices update on Overview/Devices while lowercase demo counters stop changing.
- [ ] RSSI is in dBm, uptime increases, HTTP completed/success counts increase, first-report counters exclude that request, and boot IDs differ or change after reset.
- [ ] Network features and risk remain **unavailable**, with no synthetic values substituted for physical measurements.
- [ ] Turn off Wi-Fi or unplug one board. Its dashboard report becomes stale after 20 seconds; the other board continues updating. An interrupted board cannot directly report its live disconnected state.
- [ ] Restore Wi-Fi. Serial shows reconnect attempts and connection recovery; reports resume and the observed reconnect count increments. Rebooting instead resets uptime/counters and changes boot ID.
- [ ] Temporarily stop only the backend while Wi-Fi remains on: Serial shows negative HTTP results. Restart it at the same address; reports recover and later payloads show increased HTTP failures.
- [ ] Restart a board: uptime resets, a new boot ID appears, and older rows remain in SQLite.
- [ ] Start/stop normal and abnormal software demos. Existing demo charts and alerts still work independently of physical reports.
- [ ] Restart the backend from `backend/`; old network records, alerts and physical health history remain.
- [ ] `git status --short` excludes `config.h`, `.env`, SQLite data and generated binaries before any publication.

Only mark these checks completed after observing them on your two boards. Software API tests and a frontend build are not physical hardware validation.
