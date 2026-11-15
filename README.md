# IoT Sentinel

**AI-Based Network Intrusion and Anomaly Detection — college software MVP.**

A React dashboard displays live aggregate telemetry from two **simulated** ESP32 devices. FastAPI stores every telemetry window in SQLite, extracts features, combines rules with an Isolation Forest, and records explainable alerts. Optional ESP32 firmware reports real local health and its own HTTP counters to a separate endpoint. No scans, floods, attacks, or independent packet capture occur. See [physical ESP32 setup and upload instructions](firmware/README.md).

## Requirements

- Python **3.11 or 3.12** (tested with 3.12)
- Node.js **22 or 24** and npm (tested with Node 24)
- Two terminals; no database server, credentials, or paid services needed

## Start on Windows PowerShell

From the project root (`iot-sentinel`), run in **Terminal 1**:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
Copy-Item .env.example .env
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a new **Terminal 2**, from the project root:

```powershell
Set-Location frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Open **http://127.0.0.1:5173**. API documentation: **http://127.0.0.1:8000/docs**.
No PowerShell activation or execution-policy change is required. If Python 3.11 is installed instead, use `py -3.11` for the first command. Copy the example environment file only on first setup; preserve your own `.env` on subsequent runs.

On subsequent starts, run only the `Set-Location` and server commands in each terminal. Ctrl+C stops each server. Use **one backend worker**: simulator state is in memory. Do not use multiple workers. The simulator starts stopped; SQLite data survives restarts.

For Linux/macOS, create the environment with `python3 -m venv .venv`, install with `.venv/bin/python -m pip install -r backend/requirements.txt`, then from `backend/` run `../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`. Frontend commands are the same.

## Demonstration

1. Click **Start Demo**. Each device sends a synthetic three-second telemetry window every three seconds. Charts and counts populate through API polling.
2. **Normal Behaviour** uses bounded low-rate sensor traffic counters.
3. Click **Abnormal Behaviour** and wait up to six seconds. The simulator produces elevated counters with more destinations and ports; alerts show the triggered rules and ML explanation.
4. Explore **Devices**, **Threat Detection**, and **Analytics**. Every chart, table, counter, and score comes from the backend. Empty states are shown until data exists.
5. Click **Stop Demo**. New synthetic records stop; stored records remain visible. Behaviour buttons set the next generation mode and do not themselves start a stopped simulator.

“Recent telemetry” means a device has a record received within ten seconds, not verified hardware connectivity. Browser times are local; stored timestamps are UTC. Each alert is a single anomalous device window, not a deduplicated incident.

## Detection and data flow

`Synthetic generator / legacy aggregate counters → POST telemetry → validation → features → rules + ML → SQLite → REST polling → dashboard`

`Physical ESP32 → POST physical-telemetry → validated health/counters → separate SQLite table → physical-device panel (no network risk score)`

For each measurement window, the backend derives packet rate (`packets / seconds`), byte rate (`bytes / seconds`), and average packet size (`bytes / packets`, zero if no packets). Destination count and port diversity are window-level distinct counts supplied in the telemetry contract.

Rules trigger above 80 packets/s, 50,000 bytes/s, 1,200 average bytes/packet, 12 destinations, or 10 distinct ports. The rule score is `min(number of triggered rules / 3, 1)`.

Isolation Forest trains at backend startup on **1,500 synthetic normal samples** using a fixed seed, 100 estimators, and contamination 0.03. It uses all five features. A negative `decision_function` value indicates a model deviation. The ML score is `clip(0.3 - 3 × decision_function, 0, 1)`.

**Combined risk = 0.6 × rule score + 0.4 × ML score.** This is a heuristic 0–1 score, **not a probability of compromise**. Medium ≥ 0.40, high ≥ 0.60, critical ≥ 0.80; lower scores are low. Alerts are persisted for scores ≥ 0.40. A model deviation can appear in the explanations even below the alert threshold.

This model has **not been evaluated on real network data**. No accuracy, precision, recall, or other effectiveness metrics are claimed. Functional tests validate software behaviour, not real-world detection accuracy. Correlated synthetic features and hand-selected thresholds limit generalization.

## REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Database/model health and simulator state |
| GET | `/api/dashboard` | Devices, latest 120 telemetry windows, latest 100 alerts, lifetime counts |
| POST | `/api/demo` | `{"action":"start"}`, `stop`, `normal`, or `abnormal` |
| POST | `/api/physical-telemetry` | Real device health and application counters, uppercase ESP32 IDs; optional X-API-Key |
| POST | `/api/telemetry` | Validate, score, and persist counters (201); malformed data returns 422 |

The ESP32-compatible JSON schema and its limitations are documented in [firmware/README.md](firmware/README.md). Receipt timestamps are assigned by the server. Database failures return a generic 503 response; simulator failures stop generation and surface a dashboard message.

## Configuration

`.env.example` documents `DATABASE_URL` and `CORS_ORIGINS`; defaults work locally. SQLite is created at `backend/sentinel.db` when started as documented. To point the frontend elsewhere, copy `frontend/.env.example` to `frontend/.env`, set `VITE_API_URL`, and restart Vite. Frontend environment values are public; never put secrets there. `.env`, SQLite files, dependency folders, and generated artifacts are Git-ignored.

## Verification

From the project root in Windows PowerShell:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest tests -q
Set-Location ..\frontend
npm run build
```

The backend tests use a temporary SQLite database, test real HTTP handlers, invalid payloads, derived features, persistence queries, alert linkage, running/stopped simulator behaviour, deterministic model training, normal/abnormal scoring, and zero traffic. They do not modify your demo database.

For browser smoke tests, keep both servers running as above. From `frontend/`:

```powershell
npx playwright install chromium
npm run test:e2e
```

Browser tests exercise normal and abnormal simulation, all four pages, chart rendering, stop behaviour, responsive navigation, and backend error feedback. **They add synthetic records to the running backend database and leave the simulator stopped.** If an existing Chromium installation is desired, set `$env:CHROMIUM_PATH` to its executable path. Screenshots are written into the ignored `test-results/` directory.

## Project layout

```text
iot-sentinel/
├── .env.example
├── .gitignore
├── README.md
├── VALIDATION.md
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # API, SQLAlchemy tables, simulator, feature extraction
│   │   ├── detection.py     # Rule and Isolation Forest scoring
│   │   └── physical.py      # Separate physical health schema, table and serialization
│   └── tests/
│       ├── test_api.py
│       ├── test_detection.py
│       ├── test_physical.py
│       └── conftest.py
├── frontend/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── playwright.config.ts
│   ├── src/
│   │   ├── main.tsx         # Four functional pages, API polling, demo controls
│   │   ├── style.css
│   │   └── vite-env.d.ts
│   └── tests/dashboard.spec.ts
└── firmware/
    ├── README.md           # Windows LAN setup, upload steps, verification checklist
    └── iot_sentinel/
        ├── iot_sentinel.ino
        └── config.example.h  # Copy locally to ignored config.h
```

See [VALIDATION.md](VALIDATION.md) for the executed checks and limitations.

## Deliberately deferred

Physical board validation, packet capture, real-data model evaluation, full application authentication, deployment, and production hardening. This prototype is for local demonstration. It has optional physical-ingestion key validation but no full application authentication, pagination beyond bounded dashboard history, record retention policy, or persistent simulator state. No transfer or push to GitHub is performed by the development commands.

## Physical ESP32 boards

Follow [firmware/README.md](firmware/README.md) for the exact Arduino IDE procedure for two DevKits and a Windows laptop. Start FastAPI on `--host 0.0.0.0` for LAN access, configure the laptop Wi-Fi IP in ignored `config.h`, and use uppercase `ESP32-01` / `ESP32-02`. The dashboard separately shows RSSI, uptime, last reported connectivity and HTTP counters. Network features/risk remain unavailable for these boards. The original SQLite tables and data are retained; startup only creates an additional physical health table. No hardware access or physical-board test is claimed.
