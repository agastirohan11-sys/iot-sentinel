# Validation record

Validated on 2026-11-15 in the cloud workspace with Python 3.12.14, Node 24.22.1, npm 11.9.0, and system Chromium.

| Check | Result |
|---|---|
| `cd backend` then `../.venv/bin/python -m pytest tests -q` | **5 passed**; one dependency deprecation warning |
| `cd frontend` then `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | **3 passed** |
| Mobile browser test after final responsive layout adjustment | **1 passed** |
| `cd frontend` then `npm run build` | **Passed**: TypeScript check and production asset build |
| `.venv/bin/python -m pip check` | No broken requirements |
| Live `GET /api/health` | HTTP 200; database query and trained model available |
| Live Vite entry document | HTTP 200 |
| SQLite read using an independent connection | Persisted telemetry/alert counts match the dashboard endpoint |

Browser coverage: Start Demo; normal readings; abnormal readings and alerts; all four pages; chart rendering; Stop Demo prevents new records; mobile navigation; backend connection errors. No browser runtime errors were reported in the end-to-end test. The simulator is left stopped after testing.

Build warning: the bundled charting library makes the main JavaScript chunk larger than Vite's 500 kB advisory threshold. The build succeeds; code splitting is a future performance improvement. The test-client dependency emits an AnyIO deprecation warning; it does not fail the tests.

Windows PowerShell commands are documented in README.md. They were not executed on Windows in this Linux environment. Physical ESP32 hardware and real-world detection effectiveness were not tested. Functional test counts are not model evaluation metrics.

## Physical integration update — 2026-11-15

- Backend suite after adding physical ingestion: **25 passed**, including legacy demo regression, schema rejection of invented network features, optional key validation, two separate physical IDs, counter persistence, stale status and additive table startup. One existing AnyIO test-client deprecation warning remains.
- Frontend TypeScript check and production build: **passed**. The existing chart bundle size advisory remains.
- New Playwright physical-health test: **1 passed**, covering separate physical cards, RSSI, unavailable network risk, stale connectivity, navigation and mobile width. Its reports are explicitly browser-only fixtures, not hardware observations; no physical reports were inserted into the user's SQLite database.
- Restarted the real backend with the additive physical table. Compared all **8 existing telemetry rows** and **4 existing alerts**, plus both original table definitions, with a SQLite backup: **unchanged**. Both real-board entries report `never_seen`. The new physical table is empty.
- Verified Git excludes local `firmware/iot_sentinel/config.h`, Arduino binaries/build outputs, `.env` and SQLite files. No real firmware credentials were created.
- Firmware compile attempt: **not completed**. Arduino CLI archive SHA256 was verified against official release checksums, but Arduino/Espressif SDK package indexes could not be downloaded: CLI network/DNS failures and HTTP 403 through the available curl route. No verification checks were bypassed and no unverified SDK artifacts were used.
- **Not performed:** Arduino compilation with an installed ESP32 SDK, flashing, physical board measurements, Windows execution, RF reconnect tests or hardware validation. Perform Arduino IDE Verify/Upload and the checklist in `firmware/README.md` on the Windows laptop and boards.
