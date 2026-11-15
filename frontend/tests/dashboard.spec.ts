import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:8000";

test("end-to-end demo, detection, all pages, and stop", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await request.post(api + "/api/demo", { data: { action: "stop" } });
  await request.post(api + "/api/demo", { data: { action: "normal" } });
  const initial = await (await request.get(api + "/api/dashboard")).json();
  await page.goto("/");
  await expect(page.getByText("API connected")).toBeVisible();
  await page.getByRole("button", { name: "Start Demo" }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(api + "/api/dashboard")).json()).summary
          .telemetry_count,
    )
    .toBeGreaterThan(initial.summary.telemetry_count);
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  const normal = await (await request.get(api + "/api/dashboard")).json();
  expect(
    normal.devices.every((d: any) => d.latest.source === "synthetic"),
  ).toBeTruthy();
  expect(
    normal.devices.every((d: any) => d.latest.risk_score < 0.4),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Abnormal Behaviour" }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(api + "/api/dashboard")).json()).summary
          .alert_count,
    )
    .toBeGreaterThan(normal.summary.alert_count);
  await page
    .getByRole("link", { name: "Threat Detection", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alert history" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Isolation Forest: deviation from synthetic normal reference")
      .first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Devices", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Latest device telemetry" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Risk over time" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByRole("button", { name: "Stop Demo" }).click();
  await expect(page.getByRole("button", { name: "Start Demo" })).toBeEnabled();
  const stopped = await (await request.get(api + "/api/dashboard")).json();
  await page.waitForTimeout(3400);
  const after = await (await request.get(api + "/api/dashboard")).json();
  expect(after.summary.telemetry_count).toBe(stopped.summary.telemetry_count);
  expect(after.demo.running).toBe(false);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile navigation fits screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("API connected")).toBeVisible();
  for (const name of ["Devices", "Threat Detection", "Analytics", "Overview"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
});

test("backend failure is visible and controls are disabled before data arrives", async ({
  page,
}) => {
  await page.route("**/api/dashboard", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Ensure the backend is running",
  );
  await expect(page.getByRole("button", { name: "Start Demo" })).toBeDisabled();
});
