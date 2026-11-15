import { test, expect } from "@playwright/test";

// Explicit browser-only fixture. No report is posted or claimed to come from hardware.
test("physical health is separated from demo risk and shows stale connectivity", async ({
  page,
}) => {
  const snapshot = {
    demo: { running: false, mode: "normal", last_error: null },
    devices: [],
    telemetry: [],
    alerts: [],
    summary: { telemetry_count: 0, alert_count: 0 },
    model: {
      name: "Isolation Forest",
      training_samples: 1500,
      training_source: "Synthetic normal",
      evaluation: "Not evaluated",
    },
    physical_telemetry_count: 2,
    physical_devices: [
      {
        id: "ESP32-01",
        name: "Physical DevKit 01",
        last_seen_status: "recent",
        seconds_since_seen: 2,
        latest: {
          device_id: "ESP32-01",
          timestamp: new Date().toISOString(),
          source: "physical-esp32",
          boot_id: "1234abcd",
          wifi_connected: true,
          wifi_rssi_dbm: -58,
          uptime_ms: 10000,
          wifi_reconnects: 1,
          http_requests_completed: 2,
          http_successes: 1,
          http_failures: 1,
          http_payload_bytes_attempted: 900,
          http_payload_bytes_accepted: 450,
          last_http_status: 201,
          risk_score: null,
          detection_status: "unavailable: network features not measured",
        },
      },
      {
        id: "ESP32-02",
        name: "Physical DevKit 02",
        last_seen_status: "stale",
        seconds_since_seen: 45,
        latest: {
          device_id: "ESP32-02",
          timestamp: new Date(Date.now() - 45000).toISOString(),
          source: "physical-esp32",
          boot_id: "abcd1234",
          wifi_connected: true,
          wifi_rssi_dbm: -70,
          uptime_ms: 5000,
          wifi_reconnects: 0,
          http_requests_completed: 0,
          http_successes: 0,
          http_failures: 0,
          http_payload_bytes_attempted: 0,
          http_payload_bytes_accepted: 0,
          last_http_status: null,
          risk_score: null,
          detection_status: "unavailable: network features not measured",
        },
      },
    ],
  };
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.goto("/");
  const physical = page
    .locator(".panel")
    .filter({
      has: page.getByRole("heading", { name: "Physical ESP32 devices" }),
    });
  await expect(physical.getByText("ESP32-01 · Physical DevKit")).toBeVisible();
  await expect(physical.getByText("-58 dBm")).toBeVisible();
  await expect(
    physical.getByText("Stale · connectivity unknown"),
  ).toBeVisible();
  await expect(physical.getByText(/Network risk: unavailable/)).toHaveCount(2);
  await expect(physical.getByText("Previous HTTP result")).toHaveCount(2);
  await page.getByRole("link", { name: "Devices", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Physical ESP32 devices" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Threat Detection", exact: true })
    .click();
  await expect(
    page.getByText(/physical health reports are not scored/),
  ).toBeVisible();
});
