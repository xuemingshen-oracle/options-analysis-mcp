import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test("entry basis, fees, and current results stay explicit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Payoff & time horizon" }),
  ).toBeVisible();
  const summary = page.getByLabel("Position risk summary");
  await expect(summary).toContainText("-$290");
  await expect(summary).toContainText("$710");
  await expect(summary).toContainText("$102.90");

  await page
    .getByRole("group", { name: "Leg 1", exact: true })
    .getByLabel("Entry / unit ($)")
    .fill("5");
  await expect(
    page.getByText("Results need a refresh", { exact: true }),
  ).toBeVisible();
  await expect(summary).not.toBeVisible();
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(summary).toContainText("-$370");
  await expect(summary).toContainText("$630");
  await page
    .getByText("Rates, fees & model assumptions", { exact: true })
    .click();
  await page.getByLabel("Total round-trip fees ($)").fill("10");
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(summary).toContainText("-$380");
  await expect(summary).toContainText("$103.80");
  expect(errors).toEqual([]);
});

test("calendar scenarios stop at first expiration", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByText("Calendar position: terminal bounds are unavailable"),
  ).toBeVisible();
  await page.getByLabel("Days forward", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(
    page.getByText("Horizon capped at the first expiration"),
  ).toBeVisible();
  await expect(page.getByLabel("Position risk summary")).toContainText(
    "Not defined",
  );
  await page.getByRole("button", { name: "Across dates", exact: true }).click();
  await expect(page.locator(".wb-roadmap")).toContainText("+21 days");
  await expect(page.locator(".wb-roadmap")).not.toContainText("+120 days");
  await page.getByRole("button", { name: "From today", exact: true }).click();
  await expect(
    page.getByRole("table", { name: /Value change from today/ }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Roadmap metric" })
    .getByRole("button", { name: "Gamma", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: /Modeled gamma/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: /Modeled gamma/ }),
  ).toContainText("at model boundary");
});

test("failed analysis preserves edits and can recover", async ({ page }) => {
  await page.goto("/");
  const summary = page.getByLabel("Position risk summary");
  await expect(summary).toBeVisible();
  const entry = page
    .getByRole("group", { name: "Leg 1", exact: true })
    .getByLabel("Entry / unit ($)");
  await entry.fill("5");
  await page.route("**/api/v1/research/analyze", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Temporary analysis failure" }),
    }),
  );
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(summary).not.toBeVisible();
  await expect(entry).toHaveValue("5");
  await page.unroute("**/api/v1/research/analyze");
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(summary).toContainText("-$370");
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("blocked browser storage still permits analysis and backup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("Position risk summary")).toContainText("-$290");
  await expect(page.getByRole("alert")).toContainText(
    "Browser storage is unavailable",
  );
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = await downloaded;
  expect(backup.suggestedFilename()).toMatch(/\.json$/);
});

test("a delayed result cannot replace newer position inputs", async ({
  page,
}) => {
  await page.goto("/");
  const summary = page.getByLabel("Position risk summary");
  await expect(summary).toBeVisible();
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const arrived = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/api/v1/research/analyze", async (route) => {
    const response = await route.fetch();
    received();
    await barrier;
    await route.fulfill({ response });
  });
  const entry = page
    .getByRole("group", { name: "Leg 1", exact: true })
    .getByLabel("Entry / unit ($)");
  await entry.fill("5");
  await page.getByRole("button", { name: "Analyze position" }).click();
  await arrived;
  await entry.fill("6");
  release();
  await expect(
    page.getByText("Results need a refresh", { exact: true }),
  ).toBeVisible();
  await expect(summary).not.toBeVisible();
  await expect(entry).toHaveValue("6");
  await page.unroute("**/api/v1/research/analyze");
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(summary).toContainText("-$470");
});

test("custom dates, calibrated marks and complex-position downside are inspectable", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Butterfly + put", exact: true })
    .click();
  await expect(page.getByLabel("Position risk summary")).toContainText(
    "-$7,300",
  );
  await expect(page.getByLabel("Position risk summary")).toContainText(
    "$1,700",
  );
  await expect(
    page.getByText("Entered position exceeds the loss budget", { exact: true }),
  ).toBeVisible();
  const valuation = await page
    .getByLabel("Valuation date", { exact: true })
    .inputValue();
  const target = new Date(`${valuation}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + 20);
  await page
    .getByLabel("Roadmap dates", { exact: true })
    .fill(target.toISOString().slice(0, 10));
  await page
    .getByText("Rates, fees & model assumptions", { exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Calibrate each option/ }).check();
  await page.getByRole("button", { name: "Analyze position" }).click();
  await expect(
    page.getByText("IV calibrated to entered marks", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Across dates", exact: true }).click();
  await expect(page.locator(".wb-roadmap")).toContainText("+20 days");
  await page
    .getByRole("group", { name: "Roadmap metric" })
    .getByRole("button", { name: "Gamma", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: /Modeled gamma/ }),
  ).toBeVisible();
  await page.getByLabel("Next review", { exact: true }).fill("2000-01-01");
  await expect(
    page.getByText("Your planned review is due", { exact: true }),
  ).toBeVisible();
});

test("named setup, plan, backup and review brief survive a reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Position risk summary")).toBeVisible();
  await page.getByLabel("Setup name", { exact: true }).fill("Monthly review");
  await page
    .getByLabel("What would invalidate the thesis?")
    .fill("Thesis fails if the catalyst is delayed.");
  await page
    .getByRole("button", { name: "Save named setup", exact: true })
    .click();
  await expect(page.locator(".wb-saved-list")).toContainText("Monthly review");
  await page.reload();
  await expect(page.getByLabel("Setup name", { exact: true })).toHaveValue(
    "Monthly review",
  );
  await expect(
    page.getByLabel("What would invalidate the thesis?"),
  ).toHaveValue("Thesis fails if the catalyst is delayed.");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = await download;
  const path = await backup.path();
  expect(path).not.toBeNull();
  const data = JSON.parse(await readFile(path!, "utf8"));
  expect(data.current.name).toBe("Monthly review");
  expect(data.saved).toHaveLength(1);
  await page
    .getByRole("button", {
      name: "Delete saved setup Monthly review",
      exact: true,
    })
    .click();
  await expect(page.locator(".wb-saved-list")).not.toContainText(
    "Monthly review",
  );
  await page.getByLabel("Import Option Atlas backup").setInputFiles(path!);
  await expect(page.locator(".wb-saved-list")).toContainText("Monthly review");
  await expect(page.getByLabel("Position risk summary")).toBeVisible();
  const briefDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download brief", exact: true })
    .click();
  const brief = await briefDownload;
  const text = await readFile((await brief.path())!, "utf8");
  expect(text).toContain("Thesis fails if the catalyst is delayed.");
  expect(text).toContain("from entry");
  expect(text).toContain("from today");
});

test("an incomplete draft does not erase named setups", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Setup name", { exact: true }).fill("Keep this plan");
  await page
    .getByRole("button", { name: "Save named setup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start a blank position", exact: true })
    .click();
  await page.getByLabel("Valuation date", { exact: true }).fill("");
  await page.reload();
  await expect(page.locator(".wb-saved-list")).toContainText("Keep this plan");
  await page.getByRole("button", { name: /Keep this plan.*XYZ/ }).click();
  await expect(page.getByLabel("Position risk summary")).toBeVisible();
});

test("saving a setup retires an older destructive undo snapshot", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Setup name", { exact: true })
    .fill("Saved before load");
  await page
    .getByRole("button", { name: "Save named setup", exact: true })
    .click();
  await page.getByRole("button", { name: "Condor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Undo last load / removal" }),
  ).toBeVisible();
  await page.getByLabel("Setup name", { exact: true }).fill("Saved after load");
  await page
    .getByRole("button", { name: "Save named setup", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo last load / removal" }),
  ).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".wb-saved-list")).toContainText(
    "Saved before load",
  );
  await expect(page.locator(".wb-saved-list")).toContainText(
    "Saved after load",
  );
});

test("market explorer transfers a quoted strategy and preserves workbench state", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Market explorer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Option chain", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Covered call/i }).click();
  await expect(
    page.getByRole("button", { name: "Open in position workbench →" }),
  ).toBeEnabled();
  await page
    .getByLabel("Current valuation", { exact: true })
    .selectOption("liquidation");
  await expect(
    page.getByRole("button", { name: "Open in position workbench →" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Open in position workbench →" })
    .click();
  await expect(page.getByLabel("Underlying", { exact: true })).toHaveValue(
    "SPY",
  );
  await expect(page.getByLabel("Position risk summary")).toBeVisible();
  await expect(page.getByLabel("Shares", { exact: true })).toHaveValue("100");
  await page
    .getByRole("button", { name: "Market explorer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Position workbench", exact: true })
    .click();
  await expect(page.getByLabel("Underlying", { exact: true })).toHaveValue(
    "SPY",
  );
});

test("desktop, mobile, dark and enlarged text layouts remain usable", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByLabel("Position risk summary")).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(overflow.content, `page overflow at ${width}px`).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
    await expect(
      page.getByRole("button", {
        name: width <= 760 ? "View analysis" : "Recalculate",
        exact: true,
      }),
    ).toBeVisible();
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: testInfo.outputPath(`workbench-${width}.png`),
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Increase text size", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Increase text size", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-font-scale", "130");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workbench-dark-large-text.png"),
    fullPage: true,
  });
});

test("workbench controls and contrast pass accessibility checks", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Position risk summary")).toBeVisible();
  for (const theme of ["Light", "Dark"]) {
    await page.getByRole("button", { name: theme, exact: true }).click();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  }
});

test("market explorer remains usable on narrow screens", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Market explorer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Option chain", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Covered call/i }).click();
  await expect(
    page.getByRole("button", { name: "Open in position workbench →" }),
  ).toBeEnabled();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `market explorer overflow at ${width}px`,
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: testInfo.outputPath("market-explorer-390.png"),
        fullPage: true,
      });
  }
});
