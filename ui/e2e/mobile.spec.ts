import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openSection(
  page: Page,
  name: "Position" | "Analysis" | "Plan & saves",
) {
  await page.getByRole("button", { name, exact: true }).tap();
}

async function expectNoPageOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(size.content).toBeLessThanOrEqual(size.viewport + 1);
}

async function expectTouchFields(page: Page) {
  const fields = await page
    .locator("input, select, textarea")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .filter(
          (element) =>
            !["checkbox", "range", "file"].includes(
              (element as HTMLInputElement).type,
            ),
        )
        .map((element) => ({
          name:
            element.getAttribute("aria-label") || element.id || element.tagName,
          fontSize: parseFloat(getComputedStyle(element).fontSize),
          height: element.getBoundingClientRect().height,
        })),
    );
  expect(fields.length).toBeGreaterThan(0);
  for (const field of fields) {
    expect(
      field.fontSize,
      `${field.name}: avoid iOS input zoom`,
    ).toBeGreaterThanOrEqual(16);
    expect(field.height, `${field.name}: touch height`).toBeGreaterThanOrEqual(
      44,
    );
  }
}

test("phone editing leads to fresh analysis with comfortable controls", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const entry = page
    .getByRole("group", { name: "Leg 1", exact: true })
    .getByLabel("Entry / unit ($)");
  await expect(entry).toBeVisible();

  await expectTouchFields(page);

  await entry.fill("5");
  await page
    .getByRole("heading", { name: "Position workbench", exact: true })
    .tap();
  const analyze = page.getByRole("button", {
    name: "Analyze position",
    exact: true,
  });
  const target = await analyze.boundingBox();
  expect(target!.height).toBeGreaterThanOrEqual(44);
  await analyze.tap();
  await expect(page.getByLabel("Position risk summary")).toContainText("-$370");
  await expect(page.getByLabel("Position risk summary")).toContainText("$630");
  await expectNoPageOverflow(page);

  await openSection(page, "Position");
  await expect(entry).toHaveValue("5");
  await page.getByRole("button", { name: "Edit leg 2", exact: true }).tap();
  await expect(
    page
      .getByRole("group", { name: "Leg 2", exact: true })
      .getByLabel("Entry / unit ($)"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("phone sections fit narrow, wide, and landscape screens", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "View analysis", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const section of ["Position", "Analysis", "Plan & saves"] as const) {
      await openSection(page, section);
      await expectNoPageOverflow(page);
      if (width === 390) {
        await page.screenshot({
          path: testInfo.outputPath(
            `phone-${section.toLowerCase().replaceAll(/[^a-z]+/g, "-")}.png`,
          ),
          fullPage: false,
        });
      }
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  await expectNoPageOverflow(page);
  await expectTouchFields(page);
  await page.screenshot({
    path: testInfo.outputPath("phone-landscape.png"),
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "Market explorer", exact: true })
    .tap();
  await expect(
    page.getByRole("heading", { name: "Option chain", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 430, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    await expectNoPageOverflow(page);
    await expectTouchFields(page);
  }
});

test("short editing viewport leaves the focused input reachable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "View analysis", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 400 });
  const entry = page
    .getByRole("group", { name: "Leg 1", exact: true })
    .getByLabel("Entry / unit ($)");
  await entry.tap();
  await entry.fill("5.25");
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    const fullHeight = viewport.height;
    Object.defineProperty(viewport, "height", {
      configurable: true,
      get: () => Math.max(100, fullHeight - 250),
    });
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("html")).toHaveClass(/app-keyboard-open/);
  await expect(page.locator(".app-view-tabs")).not.toBeVisible();
  await expect(page.locator(".wb-mobile-actions")).not.toBeVisible();
  await entry.scrollIntoViewIfNeeded();
  await expect(entry).toBeFocused();
  expect(
    await entry.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return hit === element || element.contains(hit);
    }),
  ).toBe(true);
  await expectNoPageOverflow(page);
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Reflect.deleteProperty(viewport, "height");
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator("html")).not.toHaveClass(/app-keyboard-open/);
  await expect(page.locator(".app-view-tabs")).toBeVisible();
  await expect(page.locator(".wb-mobile-actions")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", { name: "Position workbench", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Analyze position", exact: true })
    .tap();
  await expect(page.getByLabel("Position risk summary")).toContainText("-$395");
});

test("home screen metadata and app icons are delivered", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const manifestPath = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestPath).toBeTruthy();
  const manifestResponse = await request.get(manifestPath!);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Option Atlas");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/^image\//);
  }
  const appleIcon = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect(appleIcon).toBeTruthy();
  const iconResponse = await request.get(appleIcon!);
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toMatch(/^image\//);
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
});

test("phone settings and plan storage remain easy to reach", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Settings and app help", exact: true })
    .tap();
  await expect(
    page.getByRole("heading", { name: "Make it yours" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).tap();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoPageOverflow(page);
  await page.getByRole("button", { name: "Close app help", exact: true }).tap();

  await page.getByLabel("Setup name", { exact: true }).fill("Phone review");
  await page
    .getByRole("heading", { name: "Position workbench", exact: true })
    .tap();
  await openSection(page, "Plan & saves");
  await page
    .getByLabel("What would invalidate the thesis?")
    .fill("Review if the catalyst changes.");
  await page
    .getByRole("button", { name: "Save named setup", exact: true })
    .tap();
  await expect(page.locator(".wb-saved-list")).toContainText("Phone review");
  await page.reload();
  await openSection(page, "Plan & saves");
  await expect(page.locator(".wb-saved-list")).toContainText("Phone review");
  await expect(
    page.getByLabel("What would invalidate the thesis?"),
  ).toHaveValue("Review if the catalyst changes.");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup", exact: true }).tap();
  const backup = await downloaded;
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  const saved = JSON.parse(await readFile(backupPath!, "utf8"));
  expect(saved.current.name).toBe("Phone review");
  expect(saved.saved).toHaveLength(1);
  await page
    .getByRole("button", {
      name: "Delete saved setup Phone review",
      exact: true,
    })
    .tap();
  await expect(page.locator(".wb-saved-list")).not.toContainText(
    "Phone review",
  );
  await page
    .getByLabel("Import Option Atlas backup")
    .setInputFiles(backupPath!);
  await openSection(page, "Plan & saves");
  await expect(page.locator(".wb-saved-list")).toContainText("Phone review");
  await expectNoPageOverflow(page);
});

test("large-position chart labels fit and inspected dollars stay precise", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Covered call", exact: true }).tap();
  await page.getByLabel("Shares", { exact: true }).fill("5000");
  await page.getByRole("button", { name: "Edit leg 2", exact: true }).tap();
  await page
    .getByRole("group", { name: "Leg 2", exact: true })
    .getByLabel("Contracts", { exact: true })
    .fill("50");
  await page
    .getByRole("heading", { name: "Position workbench", exact: true })
    .tap();
  await page
    .getByRole("button", { name: "Analyze position", exact: true })
    .tap();
  await expect(page.getByLabel("Position risk summary")).toContainText(
    "$76,500",
  );

  const labels = await page.locator(".wb-chart svg").evaluate((element) => {
    const chart = element as SVGSVGElement;
    return Array.from(
      chart.querySelectorAll<SVGTextElement>(".wb-chart-label"),
      (label) => {
        const box = label.getBBox();
        return {
          text: label.textContent,
          left: box.x,
          right: box.x + box.width,
          width: chart.viewBox.baseVal.width,
        };
      },
    );
  });
  expect(labels.length).toBeGreaterThan(5);
  for (const label of labels) {
    expect(label.left, `${label.text}: left chart edge`).toBeGreaterThanOrEqual(
      -0.5,
    );
    expect(label.right, `${label.text}: right chart edge`).toBeLessThanOrEqual(
      label.width + 0.5,
    );
  }

  const slider = page.getByRole("slider", {
    name: "Inspect underlying price on payoff chart",
  });
  await slider.focus();
  await slider.press("End");
  await expect(
    page
      .locator(".wb-chart-inspector > div")
      .filter({ hasText: "Expiration P/L" }),
  ).toContainText("+$76,500");
  await expectNoPageOverflow(page);
});
