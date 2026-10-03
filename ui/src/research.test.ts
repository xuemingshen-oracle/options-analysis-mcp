import { describe, expect, it } from "vitest";

import {
  boundLabel,
  buildResearchRequest,
  decisionReminders,
  fromProviderAnalysis,
  reviewBrief,
} from "./research";
import type { PositionAnalysis } from "./types";
import { exampleSetup } from "./workbenchState";
import { interpolate } from "./ResearchChart";

const example = () => exampleSetup("vertical", "2026-10-02");

describe("manual research request", () => {
  it("converts displayed percentages, directions and fees without changing entry basis", () => {
    const setup = { ...example(), ivShift: "5", rate: "4", fees: "6.50" };
    const request = buildResearchRequest(setup);
    expect(request.legs.map((leg) => leg.quantity)).toEqual([1, -1]);
    expect(request.legs.map((leg) => leg.entry_price)).toEqual([4.2, 1.3]);
    expect(request.legs[0].implied_volatility).toBe(0.25);
    expect(request.iv_shift).toBe(0.05);
    expect(request.risk_free_rate).toBe(0.04);
    expect(request.fixed_fees).toBe(6.5);
    expect(request.fee_per_contract).toBe(0);
  });

  it("supports far upside targets without allowing a negative underlying", () => {
    const request = buildResearchRequest({ ...example(), moveRange: "300" });
    expect(request.scenario_moves).toEqual([
      -1, -0.75, -0.5, -0.25, 0, 0.75, 1.5, 2.25, 3,
    ]);
  });

  it("leaves missing marks optional while requiring actual entry prices", () => {
    const setup = example();
    setup.legs[0].currentMark = "";
    expect(buildResearchRequest(setup).legs[0].current_price).toBeNull();
    setup.legs[0].entryPrice = "";
    expect(() => buildResearchRequest(setup)).toThrow("entry price");
    setup.legs[0].entryPrice = "0";
    expect(buildResearchRequest(setup).legs[0].entry_price).toBe(0);
  });

  it("distinguishes fractional shares from whole option contracts", () => {
    const setup = example();
    setup.legs[0].quantity = "1.5";
    expect(() => buildResearchRequest(setup)).toThrow("whole number");
    setup.legs[0].kind = "stock";
    const leg = buildResearchRequest(setup).legs[0];
    expect(leg.quantity).toBe(1.5);
    expect(leg.multiplier).toBe(1);
    expect(leg).not.toHaveProperty("expiration");
    expect(leg).not.toHaveProperty("strike");
  });

  it("validates dates, horizon, and uncalibrated shifted volatility", () => {
    const setup = example();
    setup.legs[0].expiration = "2026-09-01";
    expect(() => buildResearchRequest(setup)).toThrow("on or after");
    expect(() =>
      buildResearchRequest({ ...example(), horizonDays: "1.5" }),
    ).toThrow("whole number");
    expect(() =>
      buildResearchRequest({ ...example(), ivShift: "-30" }),
    ).toThrow("IV after the shift");
  });

  it("allows the backend to validate a calibrated shift against fitted rather than entered IV", () => {
    const setup = { ...example(), ivShift: "-30", calibrateIv: true };
    expect(buildResearchRequest(setup).calibrate_iv_from_marks).toBe(true);
    setup.legs[0].currentMark = "";
    expect(() => buildResearchRequest(setup)).toThrow("IV after the shift");
  });

  it("keeps an omitted risk budget distinct from zero", () => {
    expect(
      buildResearchRequest({ ...example(), lossBudget: "" }).risk_budget,
    ).toBeNull();
    expect(() =>
      buildResearchRequest({ ...example(), lossBudget: "0" }),
    ).toThrow("loss budget");
  });

  it("converts calendar checkpoints into exact day offsets", () => {
    const request = buildResearchRequest({
      ...example(),
      roadmapDates: "2026-10-31, 2026-11-30, 2026-12-31",
    });
    expect(request.scenario_days).toEqual([29, 59, 90]);
    expect(
      buildResearchRequest({
        ...example(),
        roadmapDates: "2026-10-31,2026-10-31",
      }).scenario_days,
    ).toEqual([29]);
    expect(buildResearchRequest(example()).scenario_days).toEqual([
      0, 7, 30, 60,
    ]);
  });

  it("rejects invalid, past, or excessive calendar checkpoints", () => {
    expect(() =>
      buildResearchRequest({ ...example(), roadmapDates: "2026-09-30" }),
    ).toThrow("on or after");
    expect(() =>
      buildResearchRequest({ ...example(), roadmapDates: "2026-02-30" }),
    ).toThrow("valid roadmap date");
    expect(() =>
      buildResearchRequest({
        ...example(),
        roadmapDates: Array(9).fill("2026-10-31").join(","),
      }),
    ).toThrow("up to 8");
  });
});

function providerAnalysis(): PositionAnalysis {
  return {
    provider_id: "fake",
    underlying_symbol: "SPY",
    underlying_price: "100",
    positions: [
      {
        instrument: {
          asset_type: "option",
          symbol: "TEST",
          provider_symbol: "TEST",
          provider_id: "fake",
          option: {
            underlying_symbol: "SPY",
            expiration_date: "2030-01-18",
            put_call: "call",
            strike: "100",
            multiplier: "100",
          },
        },
        quantity: "-2",
        average_open_price: "4.20",
        current_quote: null,
        market_value: null,
        cost_basis: null,
      },
    ],
  } as PositionAnalysis;
}

describe("market explorer transfer", () => {
  it("preserves actual entry and signed quantities without inventing a current mark", () => {
    const setup = fromProviderAnalysis(
      providerAnalysis(),
      "Transferred position",
    );
    expect(setup.name).toBe("Transferred position");
    expect(setup.legs[0].action).toBe("sell");
    expect(setup.legs[0].quantity).toBe("2");
    expect(setup.legs[0].entryPrice).toBe("4.20");
    expect(setup.legs[0].currentMark).toBe("");
    expect(setup.isExample).toBe(true);
  });

  it("rejects missing cost basis and adjusted deliverables", () => {
    const analysis = providerAnalysis();
    analysis.positions[0].average_open_price = null;
    expect(() => fromProviderAnalysis(analysis)).toThrow("actual entry price");
    analysis.positions[0].average_open_price = "1";
    analysis.positions[0].instrument.option!.is_adjusted = true;
    expect(() => fromProviderAnalysis(analysis)).toThrow("Adjusted");
    analysis.positions[0].instrument.option!.is_adjusted = false;
    analysis.positions[0].instrument.option!.deliverables = [
      "nonstandard shares",
    ];
    expect(() => fromProviderAnalysis(analysis)).toThrow("nonstandard");
  });

  it("preserves the selected liquidation valuation instead of replacing it with mark", () => {
    const analysis = providerAnalysis();
    analysis.valuation_mode = "liquidation";
    analysis.positions[0].market_value = "-680";
    const setup = fromProviderAnalysis(analysis);
    expect(setup.legs[0].currentMark).toBe("3.4");
    expect(setup.plan.notes).toContain("liquidation valuation");
  });

  it("records the source quote timestamp range without pretending imported prices refreshed", () => {
    const analysis = providerAnalysis();
    const position = analysis.positions[0];
    const firstQuote = { as_of: "2026-10-01T09:30:00-04:00" } as NonNullable<
      typeof position.current_quote
    >;
    const lastQuote = { as_of: "2026-10-01T13:31:00Z" } as NonNullable<
      typeof position.current_quote
    >;
    analysis.positions = [
      { ...position, market_value: "-600", current_quote: firstQuote },
      { ...position, market_value: "-620", current_quote: lastQuote },
    ];
    const setup = fromProviderAnalysis(analysis);
    expect(setup.plan.notes).toContain(
      "2026-10-01T13:30:00.000Z through 2026-10-01T13:31:00.000Z",
    );
    expect(setup.plan.notes).toContain(
      "copied snapshots, not refreshed quotes",
    );
    expect(setup.legs.map((leg) => leg.currentMark)).toEqual(["3", "3.1"]);
    expect(setup.plan.notes.length).toBeLessThanOrEqual(8000);
  });
});

describe("calendar review reminders", () => {
  it("makes a saved review due based on today rather than the old pricing date", () => {
    const setup = example();
    setup.plan.reviewDate = "2026-10-09";
    const findings = decisionReminders(setup, 0, "2026-11-01");
    expect(findings.some((finding) => finding.code === "plan_review_due")).toBe(
      true,
    );
    expect(
      findings.find((finding) => finding.code === "plan_review_due")?.detail,
    ).toContain("today is 2026-11-01");
  });

  it("does not pull a future reminder forward to a hypothetical valuation date", () => {
    const setup = { ...example(), valuationDate: "2026-11-20" };
    setup.plan.reviewDate = "2026-10-09";
    const findings = decisionReminders(setup, 0, "2026-10-02");
    expect(findings.some((finding) => finding.code === "plan_review_due")).toBe(
      false,
    );
    expect(
      findings.find((finding) => finding.code === "future_valuation_date")
        ?.severity,
    ).toBe("info");
  });

  it("reports the age of an old manual snapshot and leaves its pricing date unchanged", () => {
    const setup = { ...example(), isExample: false };
    const findings = decisionReminders(setup, 0, "2026-11-01");
    expect(
      findings.find((finding) => finding.code === "valuation_snapshot_age")
        ?.title,
    ).toBe("Valuation snapshot is 30 days old");
    expect(
      findings.find((finding) => finding.code === "valuation_snapshot_age")
        ?.detail,
    ).toContain("Update the valuation date");
    expect(setup.valuationDate).toBe("2026-10-02");
    expect(
      decisionReminders(setup, 0, "2026-10-02").some(
        (finding) => finding.code === "valuation_snapshot_age",
      ),
    ).toBe(false);
  });
});

describe("payoff inspection and review handoff", () => {
  it("interpolates piecewise payoff and refuses to extrapolate beyond its points", () => {
    const points = [
      { x: 90, y: -200 },
      { x: 100, y: -200 },
      { x: 110, y: 800 },
    ];
    expect(interpolate(points, 95)).toBe(-200);
    expect(interpolate(points, 105)).toBe(300);
    expect(interpolate(points, 110)).toBe(800);
    expect(interpolate(points, 120)).toBeNull();
    expect(interpolate([], 100)).toBeNull();
  });

  it("keeps unknown risk bounds distinct from unlimited loss", () => {
    expect(boundLabel(null, null)).toBe("Not defined");
    expect(boundLabel(null, false)).toBe("Unlimited");
    expect(boundLabel(-290, true)).toBe("-$290");
  });

  it("exports example provenance, entry basis and an uncalculated-state notice", () => {
    const setup = example();
    setup.plan.invalidation = "A break below $95";
    const brief = reviewBrief(setup, null);
    expect(brief).toContain("SYNTHETIC EXAMPLE");
    expect(brief).toContain("entry $4.20");
    expect(brief).toContain("No current analysis is included");
    expect(brief).toContain("A break below $95");
    expect(brief).toContain("No probability-of-profit claim");
    setup.spot = "";
    setup.legs[0].entryPrice = "";
    const incomplete = reviewBrief(setup, null);
    expect(incomplete).toContain("spot not supplied");
    expect(incomplete).toContain("entry not supplied");
    expect(incomplete).not.toContain("entry $0.00");
  });
});
