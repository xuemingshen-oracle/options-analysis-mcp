import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function prepareSavedDraft(page: Page) {
  const result = await (
    await page.request.get("/api/v1/workspaces/SPY?limit=100")
  ).json();
  const quote = result.workspace.chain.contracts[0];
  await page.route("**/api/v1/strategy-drafts", (route) =>
    route.fulfill({
      json: {
        error: null,
        drafts: [
          {
            draft_id: "00000000-0000-4000-8000-000000000001",
            name: "Delayed restore",
            underlying_symbol: "SPY",
            provider_id: "fake",
            strategy_template_id: "custom",
            created_at: "2026-10-02T15:00:00Z",
            updated_at: "2026-10-02T15:00:00Z",
            legs: [
              {
                symbol: quote.instrument.symbol,
                provider_symbol: quote.instrument.provider_symbol,
                asset_type: "option",
                quantity: "1",
                average_open_price: "3",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Market explorer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "SPY", exact: true }),
  ).toBeVisible();
}

async function holdFirstAnalysis(page: Page) {
  let release!: () => void;
  let signalStarted!: () => void;
  let signalFinished!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    signalFinished = resolve;
  });
  const modes: string[] = [];
  let held = false;
  await page.route("**/api/v1/analyses/positions", async (route) => {
    modes.push(route.request().postDataJSON().valuation_mode);
    if (held) {
      await route.continue();
      return;
    }
    held = true;
    const response = await route.fetch();
    signalStarted();
    await gate;
    try {
      await route.fulfill({ response });
    } finally {
      signalFinished();
    }
  });
  return { release, started, finished, modes };
}

test("saved restore uses the valuation chosen while its quotes were loading", async ({
  page,
}) => {
  await prepareSavedDraft(page);
  const pending = await holdFirstAnalysis(page);
  await page.getByRole("button", { name: /^Delayed restore SPY/ }).click();
  await pending.started;
  await page
    .getByLabel("Current valuation", { exact: true })
    .selectOption("liquidation");
  await expect(
    page.getByRole("button", { name: "Open in position workbench →" }),
  ).toBeDisabled();
  pending.release();
  await pending.finished;
  const transfer = page.getByRole("button", {
    name: "Open in position workbench →",
  });
  await expect(transfer).toBeEnabled();
  expect(pending.modes).toEqual(["mark", "liquidation"]);
  await transfer.click();
  await expect(page.getByLabel("Review notes / next action")).toHaveValue(
    /liquidation valuation/,
  );
});

test("switching symbols cancels a pending restore without replacing the newer workspace", async ({
  page,
}) => {
  await prepareSavedDraft(page);
  const pending = await holdFirstAnalysis(page);
  await page.getByRole("button", { name: /^Delayed restore SPY/ }).click();
  await pending.started;
  await page.getByRole("button", { name: /^QQQ / }).click();
  await expect(
    page.getByRole("heading", { name: "QQQ", exact: true }),
  ).toBeVisible();
  pending.release();
  await pending.finished;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(
    page.getByRole("heading", { name: "QQQ", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Strategy draft name")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Open in position workbench →" }),
  ).toBeDisabled();
});
