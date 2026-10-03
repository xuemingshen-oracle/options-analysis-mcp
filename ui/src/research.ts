import { blankPlan, dateAfter, newId, today } from "./workbenchState";
import type { WorkbenchSetup } from "./workbenchState";
import type { PositionAnalysis } from "./types";

export function fromProviderAnalysis(
  analysis: PositionAnalysis,
  name?: string,
): WorkbenchSetup {
  const spot = Number(analysis.underlying_price);
  if (
    analysis.underlying_price === null ||
    !Number.isFinite(spot) ||
    spot <= 0 ||
    !analysis.underlying_symbol
  ) {
    throw new Error(
      "A single underlying and a current underlying price are needed to open this position in the workbench.",
    );
  }
  const date = today();
  const quoteTimes = analysis.positions
    .flatMap((position) => {
      const timestamp = position.current_quote?.as_of;
      return timestamp && Number.isFinite(Date.parse(timestamp))
        ? [new Date(timestamp).toISOString()]
        : [];
    })
    .sort();
  const timestampNote = quoteTimes.length
    ? `Source quote as-of range (UTC): ${quoteTimes[0]} through ${quoteTimes[quoteTimes.length - 1]}.${quoteTimes.length < analysis.positions.length ? " Some legs have no quote timestamp." : ""}`
    : "Source quote timestamps are unavailable in this analysis.";
  const legs = analysis.positions.map((position) => {
    if (position.average_open_price === null)
      throw new Error(
        "Enter the actual entry price for every leg before opening this position in the workbench.",
      );
    const terms = position.instrument.option;
    if (
      terms &&
      (terms.is_adjusted === true || (terms.deliverables?.length ?? 0) > 0)
    ) {
      throw new Error(
        "Adjusted or nonstandard option deliverables cannot be modeled in the workbench. Use standard stock-option contracts.",
      );
    }
    const quantity = Number(position.quantity);
    if (!Number.isFinite(quantity) || quantity === 0)
      throw new Error("Each position leg needs a valid quantity.");
    if (!terms && !["equity", "etf"].includes(position.instrument.asset_type))
      throw new Error(
        "The workbench supports stock, ETF, and standard stock-option legs.",
      );
    const current = position.current_quote;
    const multiplier = terms ? Number(terms.multiplier) : 1;
    const effectivePrice =
      position.market_value === null
        ? null
        : Number(position.market_value) / (quantity * multiplier);
    return {
      id: newId(),
      kind: terms?.put_call ?? ("stock" as const),
      action: quantity > 0 ? ("buy" as const) : ("sell" as const),
      quantity: String(Math.abs(quantity)),
      strike: terms ? String(terms.strike) : "",
      expiration: terms?.expiration_date ?? dateAfter(date, 45),
      entryPrice: String(position.average_open_price),
      currentMark:
        effectivePrice === null ||
        !Number.isFinite(effectivePrice) ||
        effectivePrice < 0
          ? ""
          : String(effectivePrice),
      volatility: String(
        current?.implied_volatility === null ||
          current?.implied_volatility === undefined
          ? 30
          : Number(current.implied_volatility) * 100,
      ),
      multiplier: terms ? String(terms.multiplier) : "1",
    };
  });
  return {
    name: name?.trim() || `${analysis.underlying_symbol} position`,
    symbol: analysis.underlying_symbol,
    spot: String(spot),
    valuationDate: date,
    rate: "4",
    dividendYield: "0",
    fees: "0",
    horizonDays: "7",
    roadmapDates: "",
    ivShift: "0",
    moveRange: "20",
    lossBudget: "",
    isExample: analysis.provider_id === "fake",
    calibrateIv: false,
    legs,
    plan: {
      ...blankPlan(),
      notes:
        `Imported from ${analysis.provider_id} market explorer using ${analysis.valuation_mode} valuation. Current per-leg prices preserve that valuation when available. ${timestampNote} These are copied snapshots, not refreshed quotes. Check entry prices, rates, dividend yield, fees, and IV assumptions before using the model. Missing provider IV defaults to 30%.`.slice(
          0,
          8000,
        ),
    },
  };
}

export type ResearchNumber = string | number;

export interface ManualResearchLeg {
  kind: "stock" | "call" | "put";
  quantity: number;
  entry_price: number;
  current_price: number | null;
  strike?: number;
  expiration?: string;
  implied_volatility: number;
  multiplier: number;
}

export interface ResearchRequest {
  symbol: string;
  spot: number;
  valuation_date: string;
  legs: ManualResearchLeg[];
  risk_free_rate: number;
  dividend_yield: number;
  fee_per_contract: number;
  fixed_fees: number;
  horizon_days: number;
  iv_shift: number;
  scenario_moves: number[];
  scenario_days: number[];
  calibrate_iv_from_marks: boolean;
  risk_budget: number | null;
}

export interface ResearchPoint {
  underlying_price: ResearchNumber;
  position_value: ResearchNumber;
  profit_loss: ResearchNumber;
}

export interface ResearchAnalysis {
  symbol: string;
  valuation_date: string;
  spot: ResearchNumber;
  legs: Array<
    Omit<
      ManualResearchLeg,
      | "quantity"
      | "entry_price"
      | "current_price"
      | "strike"
      | "implied_volatility"
      | "multiplier"
    > & {
      quantity: ResearchNumber;
      entry_price: ResearchNumber;
      current_price: ResearchNumber | null;
      strike: ResearchNumber | null;
      implied_volatility: ResearchNumber;
      multiplier: ResearchNumber;
    }
  >;
  requested_horizon_days: number;
  horizon_days: number;
  horizon_date: string;
  expiration_date: string | null;
  net_entry_value: ResearchNumber;
  current_value: ResearchNumber;
  current_model_value: ResearchNumber;
  current_profit_loss: ResearchNumber;
  total_fees: ResearchNumber;
  modeled_greeks: {
    delta: ResearchNumber;
    gamma: ResearchNumber;
    theta: ResearchNumber;
    vega: ResearchNumber;
    rho: ResearchNumber;
  };
  max_profit: ResearchNumber | null;
  max_profit_bounded: boolean | null;
  max_loss: ResearchNumber | null;
  max_loss_bounded: boolean | null;
  break_even_prices: ResearchNumber[];
  reward_risk_ratio: ResearchNumber | null;
  payoff_points: ResearchPoint[];
  horizon_points: ResearchPoint[];
  scenarios: Array<{
    move: ResearchNumber;
    underlying_price: ResearchNumber;
    position_value: ResearchNumber;
    profit_loss: ResearchNumber;
    change_from_today: ResearchNumber;
    modeled_greeks?: ResearchAnalysis["modeled_greeks"];
    greek_boundary?: boolean;
  }>;
  timeline?: Array<{
    horizon_days: number;
    horizon_date: string;
    scenarios: ResearchAnalysis["scenarios"];
  }>;
  leg_breakdown?: Array<{
    index: number;
    kind: "stock" | "call" | "put";
    quantity: ResearchNumber;
    multiplier: ResearchNumber;
    entry_price: ResearchNumber;
    current_price: ResearchNumber;
    model_price: ResearchNumber;
    implied_volatility: ResearchNumber;
    intrinsic_value: ResearchNumber;
    extrinsic_value: ResearchNumber;
    entry_value: ResearchNumber;
    current_value: ResearchNumber;
    model_value: ResearchNumber;
    profit_loss: ResearchNumber;
    input_implied_volatility?: ResearchNumber;
    iv_source?: "entered" | "calibrated";
  }>;
  findings: Array<{
    code: string;
    severity: "info" | "caution" | "danger";
    title: string;
    detail: string;
  }>;
  sizing: {
    risk_budget: ResearchNumber | null;
    risk_per_position: ResearchNumber | null;
    max_position_units: number | null;
    fits_budget: boolean | null;
    budget_used_percent: ResearchNumber | null;
  };
  assumptions: string[];
}

export function decisionReminders(
  setup: WorkbenchSetup,
  currentProfitLoss: ResearchNumber,
  currentDate = today(),
): ResearchAnalysis["findings"] {
  const findings: ResearchAnalysis["findings"] = [];
  const pnl = Number(currentProfitLoss);
  if (
    setup.plan.profitTarget !== "" &&
    Number(setup.plan.profitTarget) > 0 &&
    pnl >= Number(setup.plan.profitTarget)
  ) {
    findings.push({
      code: "plan_profit_target",
      title: "Your profit target has been reached",
      detail:
        "Compare the current position P/L with your planned exit. A model mark is not a guaranteed fill.",
      severity: "caution",
    });
  }
  if (
    setup.plan.lossLimit !== "" &&
    Number(setup.plan.lossLimit) > 0 &&
    pnl <= -Number(setup.plan.lossLimit)
  ) {
    findings.push({
      code: "plan_loss_limit",
      title: "Your loss limit has been reached",
      detail:
        "Revisit the exit rule you wrote before taking more risk. Gaps and liquidity can move realized losses beyond this amount.",
      severity: "danger",
    });
  }
  if (setup.plan.reviewDate && setup.plan.reviewDate <= currentDate) {
    findings.push({
      code: "plan_review_due",
      title: "Your planned review is due",
      detail: `Review date: ${setup.plan.reviewDate}; today is ${currentDate}. Recheck the thesis, events, and exit conditions. This reminder uses today's date, independently of the pricing valuation date.`,
      severity: "caution",
    });
  }
  const age = Math.round(
    (Date.parse(currentDate) - Date.parse(setup.valuationDate)) / 86_400_000,
  );
  if (age > 0 && !setup.isExample) {
    findings.push({
      code: "valuation_snapshot_age",
      title: `Valuation snapshot is ${age} ${age === 1 ? "day" : "days"} old`,
      detail: `The model still uses ${setup.valuationDate}. Saved marks do not refresh automatically. Update the valuation date, underlying spot, option marks and IV before treating the result as a current review.`,
      severity: "caution",
    });
  } else if (age < 0) {
    findings.push({
      code: "future_valuation_date",
      title: "The valuation date is in the future",
      detail: `The model is anchored to ${setup.valuationDate}, ${Math.abs(age)} ${age === -1 ? "day" : "days"} after today. Treat this as a hypothetical future snapshot, not a current valuation.`,
      severity: "info",
    });
  }
  return findings;
}

function requiredNumber(
  value: string,
  label: string,
  min: number,
  max: number,
): number {
  if (!value.trim()) throw new Error(`Enter ${label}.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max)
    throw new Error(
      `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`,
    );
  return parsed;
}

function validDate(value: string, label: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Enter a valid ${label}.`);
  }
}

export function buildResearchRequest(setup: WorkbenchSetup): ResearchRequest {
  const symbol = setup.symbol.trim().toUpperCase();
  if (!symbol || symbol.length > 20)
    throw new Error("Enter an underlying symbol (up to 20 characters).");
  validDate(setup.valuationDate, "valuation date");
  if (!setup.legs.length)
    throw new Error("Add at least one stock or option leg.");
  const spot = requiredNumber(
    setup.spot,
    "underlying price",
    0.000001,
    1_000_000,
  );
  const ivShift = requiredNumber(setup.ivShift, "IV change", -500, 500) / 100;
  const horizonDays = requiredNumber(
    setup.horizonDays,
    "days forward",
    0,
    3650,
  );
  if (!Number.isInteger(horizonDays))
    throw new Error("Days forward must be a whole number.");
  const legs = setup.legs.map((leg, index): ManualResearchLeg => {
    const label = `leg ${index + 1}`;
    const quantity = requiredNumber(
      leg.quantity,
      `${label} quantity`,
      0.000001,
      1_000_000,
    );
    if (leg.kind !== "stock" && !Number.isInteger(quantity))
      throw new Error(`${label} needs a whole number of option contracts.`);
    const entry = requiredNumber(
      leg.entryPrice,
      `${label} entry price`,
      0,
      1_000_000,
    );
    const current =
      leg.currentMark.trim() === ""
        ? null
        : requiredNumber(
            leg.currentMark,
            `${label} current mark`,
            0,
            1_000_000,
          );
    const iv =
      leg.kind === "stock"
        ? 0
        : requiredNumber(leg.volatility, `${label} IV`, 0, 500) / 100;
    if (leg.kind !== "stock") {
      validDate(leg.expiration, `${label} expiration`);
      const days =
        (Date.parse(leg.expiration) - Date.parse(setup.valuationDate)) /
        86_400_000;
      if (days < 0 || days > 3650)
        throw new Error(
          `${label} expiration must be on or after the valuation date and within 10 years.`,
        );
      if (
        !(setup.calibrateIv && current !== null) &&
        (iv + ivShift < 0 || iv + ivShift > 5)
      )
        throw new Error(
          `${label} IV after the shift must stay between 0% and 500%.`,
        );
    }
    return {
      kind: leg.kind,
      quantity: (leg.action === "sell" ? -1 : 1) * quantity,
      entry_price: entry,
      current_price: current,
      implied_volatility: iv,
      multiplier:
        leg.kind === "stock"
          ? 1
          : requiredNumber(
              leg.multiplier,
              `${label} multiplier`,
              0.000001,
              10_000,
            ),
      ...(leg.kind === "stock"
        ? {}
        : {
            strike: requiredNumber(
              leg.strike,
              `${label} strike`,
              0.000001,
              1_000_000,
            ),
            expiration: leg.expiration,
          }),
    };
  });
  const range = requiredNumber(setup.moveRange, "scenario range", 1, 500) / 100;
  let scenarioDays = [0, 7, 30, 60];
  if (setup.roadmapDates?.trim()) {
    const dates = setup.roadmapDates
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!dates.length || dates.length > 8)
      throw new Error("Enter up to 8 comma-separated roadmap dates.");
    scenarioDays = dates.map((value) => {
      validDate(value, "roadmap date (YYYY-MM-DD)");
      const days =
        (Date.parse(value) - Date.parse(setup.valuationDate)) / 86_400_000;
      if (days < 0 || days > 3650)
        throw new Error(
          "Roadmap dates must be on or after the valuation date and within 10 years.",
        );
      return days;
    });
  }
  return {
    symbol,
    spot,
    valuation_date: setup.valuationDate,
    legs,
    risk_free_rate:
      requiredNumber(setup.rate, "risk-free rate", -10, 100) / 100,
    dividend_yield:
      requiredNumber(setup.dividendYield, "dividend yield", 0, 100) / 100,
    fixed_fees: requiredNumber(
      setup.fees,
      "total round-trip fees",
      0,
      1_000_000,
    ),
    fee_per_contract: 0,
    horizon_days: horizonDays,
    iv_shift: ivShift,
    scenario_moves: Array.from({ length: 9 }, (_, i) =>
      Number((((i - 4) * (i < 4 ? Math.min(range, 1) : range)) / 4).toFixed(8)),
    ),
    scenario_days: [...new Set(scenarioDays)].sort((a, b) => a - b),
    calibrate_iv_from_marks: setup.calibrateIv,
    risk_budget:
      setup.lossBudget.trim() === ""
        ? null
        : requiredNumber(setup.lossBudget, "loss budget", 0.01, 1_000_000_000),
  };
}

export async function analyzeResearch(
  request: ResearchRequest,
  signal?: AbortSignal,
): Promise<ResearchAnalysis> {
  const response = await fetch("/api/v1/research/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  let result: {
    analysis?: ResearchAnalysis;
    error?: { message?: string; field_paths?: string[] };
  };
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The local analysis service returned an unexpected response. Check that the app server is running.",
    );
  }
  if (!response.ok || result.error || !result.analysis) {
    const fields = result.error?.field_paths?.join(", ");
    throw new Error(
      `${result.error?.message ?? "Unable to analyze this position."}${fields ? ` (${fields})` : ""}`,
    );
  }
  return result.analysis;
}

export function money(
  value: ResearchNumber | null | undefined,
  digits = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)))
    return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

export function signedMoney(value: ResearchNumber, digits = 0): string {
  return `${Number(value) > 0 ? "+" : ""}${money(value, digits)}`;
}

export function percent(value: ResearchNumber, digits = 1): string {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function boundLabel(
  value: ResearchNumber | null,
  bounded: boolean | null,
): string {
  if (bounded === false) return "Unlimited";
  if (bounded === null) return "Not defined";
  return money(value);
}

export function reviewBrief(
  setup: WorkbenchSetup,
  analysis: ResearchAnalysis | null,
): string {
  const legs = setup.legs.map((leg) => {
    const contract =
      leg.kind === "stock"
        ? "shares"
        : `${leg.expiration} ${money(leg.strike, 2)} ${leg.kind} (multiplier ${leg.multiplier})`;
    return `- ${leg.action === "buy" ? "Long" : "Short"} ${leg.quantity} ${contract}; entry ${leg.entryPrice.trim() === "" ? "not supplied" : money(leg.entryPrice, 2)}; current mark ${leg.currentMark === "" ? "not supplied (model used)" : money(leg.currentMark, 2)}${leg.kind === "stock" ? "" : `; IV ${leg.volatility}%`}.`;
  });
  const findings = analysis
    ? [
        ...decisionReminders(setup, analysis.current_profit_loss),
        ...analysis.findings,
      ].map((finding) => `- ${finding.title}: ${finding.detail}`)
    : [];
  return [
    `# Position review: ${setup.name || setup.symbol}`,
    "",
    "Please help me evaluate the risk/reward and my decision process. Challenge my thesis, identify missing information, and compare holding, reducing, closing, or adjusting without assuming a trade is appropriate.",
    "",
    `Data: ${setup.isExample ? "SYNTHETIC EXAMPLE — not actual market quotes" : "manually entered, not independently verified or live"}.`,
    `Underlying: ${setup.symbol}; spot ${setup.spot.trim() === "" ? "not supplied" : money(setup.spot, 2)}; valuation date ${setup.valuationDate}.`,
    `IV calibration from current option marks: ${setup.calibrateIv ? "enabled; check calibration findings and effective IV" : "disabled; entered per-leg IV is used"}.`,
    "",
    "## Position",
    ...legs,
    "",
    `Assumptions: rate ${setup.rate}%, dividend yield ${setup.dividendYield}%, total round-trip fees ${money(setup.fees, 2)}.`,
    `Stress horizon: ${analysis?.horizon_date ?? `${setup.horizonDays} days forward`}; IV shift ${setup.ivShift} percentage points; price moves from -${Math.min(Number(setup.moveRange), 100)}% to +${setup.moveRange}%.`,
    `Roadmap dates: ${setup.roadmapDates?.trim() || "default checkpoints (today, +7, +30, +60 days)"}; dates beyond the earliest expiration are capped.`,
    `Loss budget for this complete position: ${setup.lossBudget === "" ? "not specified" : money(setup.lossBudget)}.`,
    ...(analysis
      ? [
          "",
          "## Calculated result",
          `Entry value: ${money(analysis.net_entry_value, 2)} (positive debit, negative credit).`,
          `Current P/L from entry, after modeled fees: ${money(analysis.current_profit_loss, 2)}.`,
          `Expiration max profit: ${boundLabel(analysis.max_profit, analysis.max_profit_bounded)}; max loss: ${boundLabel(analysis.max_loss, analysis.max_loss_bounded)}.`,
          `Expiration break-even prices: ${analysis.break_even_prices.map((value) => money(value, 2)).join(", ") || "not defined"}.`,
          "",
          "## Horizon scenarios (P/L from entry; change from current value)",
          ...analysis.scenarios.map(
            (row) =>
              `- ${percent(row.move)} / ${money(row.underlying_price, 2)}: ${money(row.profit_loss)} from entry; ${signedMoney(row.change_from_today)} from today.`,
          ),
          "",
          "## Deterministic review",
          ...findings,
          "",
          "## Model assumptions",
          ...analysis.assumptions.map((value) => `- ${value}`),
        ]
      : [
          "",
          "No current analysis is included; inputs have changed or have not been analyzed.",
        ]),
    "",
    "## My trade plan",
    `Thesis: ${setup.plan.thesis || "not recorded"}`,
    `Invalidation: ${setup.plan.invalidation || "not recorded"}`,
    `Profit target (position P/L): ${setup.plan.profitTarget === "" ? "not recorded" : money(setup.plan.profitTarget)}.`,
    `Loss limit (positive loss amount): ${setup.plan.lossLimit === "" ? "not recorded" : money(setup.plan.lossLimit)}.`,
    `Review date: ${setup.plan.reviewDate || "not recorded"}.`,
    `Notes: ${setup.plan.notes || "none"}`,
    "",
    "This is a European option approximation, not a forecast or executable quote. It does not simulate early assignment, margin calls, discrete dividends, liquidity or tax treatment. No probability-of-profit claim is made.",
  ].join("\n");
}
