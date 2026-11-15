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
