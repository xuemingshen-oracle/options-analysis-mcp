import { describe, expect, it } from "vitest";

import {
  buildTemplateDraft,
  draftFromAnalysis,
  nextExpiration,
  requiresSecondaryExpiration,
  StrategyBuildError,
  toAnalysisRequestLegs,
  toStrategyDraftLegs,
} from "./strategies";
import type {
  PutCall,
  PositionAnalysis,
  Quote,
  StrategyTemplate,
  WorkspaceSnapshot,
} from "./types";

function option(
  side: PutCall,
  strike: number,
  expiration = "2030-01-18",
): Quote {
  const code = side === "call" ? "C" : "P";
  return {
    instrument: {
      asset_type: "option",
      symbol: `SPY-${expiration}-${code}-${strike}`,
      provider_id: "fake",
      provider_symbol: `SPY-${expiration}-${code}-${strike}`,
      option: {
        underlying_symbol: "SPY",
        expiration_date: expiration,
        put_call: side,
        strike,
        multiplier: 100,
      },
    },
    provider_id: "fake",
    as_of: "2026-01-02T15:30:00Z",
    received_at: "2026-01-02T15:30:00Z",
    bid: 1.9,
    ask: 2.1,
    last: 2,
    mark: 2,
    volume: 100,
    open_interest: 500,
    implied_volatility: 0.25,
    greeks: null,
    warnings: [],
  };
}

function workspace(expiration = "2030-01-18"): WorkspaceSnapshot {
  const underlying: Quote = {
    ...option("call", 100),
    instrument: {
      asset_type: "equity",
      symbol: "SPY",
      provider_id: "fake",
      provider_symbol: "SPY",
      option: null,
    },
    mark: 100,
  };
  const contracts = [90, 95, 100, 105, 110].flatMap((strike) => [
    option("put", strike, expiration),
    option("call", strike, expiration),
  ]);
  return {
    provider_id: "fake",
    symbol: "SPY",
    quote: underlying,
    expirations: ["2030-01-18", "2030-02-15"],
    chain: {
      provider_id: "fake",
      underlying_symbol: "SPY",
      as_of: underlying.as_of,
      underlying_quote: underlying,
      contracts,
      warnings: [],
    },
  };
}

function template(templateId: string): StrategyTemplate {
  return {
    template_id: templateId,
    display_name: templateId,
    description: templateId,
    outlook: "neutral",
    same_expiration: true,
    legs: [],
  };
}

describe("strategy template generation", () => {
  it("builds a covered call with signed intent and mark entries", () => {
    const legs = buildTemplateDraft(template("covered_call"), workspace());

    expect(legs.map((leg) => [leg.quote.instrument.asset_type, leg.action, leg.quantity])).toEqual([
      ["equity", "buy", 100],
      ["option", "sell", 1],
    ]);
    expect(legs[1].quote.instrument.option?.strike).toBe(100);
    expect(legs[0].entryPrice).toBe(100);
    expect(toAnalysisRequestLegs(legs).map((leg) => leg.quantity)).toEqual([100, -1]);
    expect(toStrategyDraftLegs(legs)).toMatchObject([
      { symbol: "SPY", provider_symbol: "SPY", quantity: 100 },
      { quantity: -1 },
    ]);
  });

  it("builds ordered vertical, butterfly, and condor legs", () => {
    const source = workspace();
    const strikes = (id: string) =>
      buildTemplateDraft(template(id), source).map(
        (leg) => leg.quote.instrument.option?.strike ?? "stock",
      );

    expect(strikes("bull_call_spread")).toEqual([100, 105]);
    expect(strikes("bear_put_spread")).toEqual([95, 100]);
    expect(strikes("long_call_butterfly")).toEqual([95, 100, 105]);
    expect(strikes("iron_condor")).toEqual([90, 95, 105, 110]);
  });

  it("builds stock hedges, short puts, and volatility strategies", () => {
    const source = workspace();
    const shape = (id: string) =>
      buildTemplateDraft(template(id), source).map((leg) => [
        leg.quote.instrument.option?.strike ?? "stock",
        leg.action,
        leg.quantity,
      ]);

    expect(shape("protective_put")).toEqual([
      ["stock", "buy", 100],
      [100, "buy", 1],
    ]);
    expect(shape("collar")).toEqual([
      ["stock", "buy", 100],
      [95, "buy", 1],
      [105, "sell", 1],
    ]);
    expect(shape("cash_secured_put")).toEqual([[95, "sell", 1]]);
    expect(shape("long_straddle")).toEqual([
      [100, "buy", 1],
      [100, "buy", 1],
    ]);
    expect(shape("long_strangle")).toEqual([
      [95, "buy", 1],
      [105, "buy", 1],
    ]);
  });

  it("builds calendar and diagonal legs from the next expiration", () => {
    const near = workspace();
    const far = workspace("2030-02-15");
    const shape = (id: string) =>
      buildTemplateDraft(template(id), near, [], far).map((leg) => [
        leg.quote.instrument.option?.expiration_date,
        leg.quote.instrument.option?.strike,
        leg.action,
      ]);

    expect(shape("call_calendar")).toEqual([
      ["2030-01-18", 100, "sell"],
      ["2030-02-15", 100, "buy"],
    ]);
    expect(shape("call_diagonal")).toEqual([
      ["2030-01-18", 105, "sell"],
      ["2030-02-15", 100, "buy"],
    ]);
    expect(() => buildTemplateDraft(template("call_calendar"), near)).toThrow(
      "Load a second expiration",
    );
  });

  it("identifies templates with multiple expiration roles", () => {
    const source = template("call_calendar");
    source.legs = [
      {
        label: "near",
        asset_type: "option",
        action: "sell",
        ratio: 1,
        put_call: "call",
        strike_order: 0,
        expiration_order: 0,
      },
      {
        label: "far",
        asset_type: "option",
        action: "buy",
        ratio: 1,
        put_call: "call",
        strike_order: 0,
        expiration_order: 1,
      },
    ];

    expect(requiresSecondaryExpiration(source)).toBe(true);
    expect(requiresSecondaryExpiration(template("long_call"))).toBe(false);
    expect(
      nextExpiration(["2030-03-15", "2030-01-18", "2030-02-15"], "2030-01-18"),
    ).toBe("2030-02-15");
  });

  it("restores editable legs from enriched saved-draft analysis", () => {
    const quote = option("put", 95);
    const analysis = {
      positions: [
        {
          instrument: quote.instrument,
          quantity: -2,
          average_open_price: 1.75,
          current_quote: quote,
          market_value: -400,
          cost_basis: -350,
        },
      ],
    } as PositionAnalysis;

    expect(draftFromAnalysis(analysis)).toEqual([
      { quote, action: "sell", quantity: 2, entryPrice: 1.75 },
    ]);
  });

  it("preserves unknown entry prices instead of inventing a cost basis", () => {
    const quote = option("put", 95);
    const analysis = {
      positions: [{
        instrument: quote.instrument,
        quantity: -2,
        average_open_price: null,
        current_quote: quote,
        market_value: -400,
        cost_basis: null,
      }],
    } as PositionAnalysis;

    const legs = draftFromAnalysis(analysis);

    expect(legs[0].entryPrice).toBeNull();
    expect(toAnalysisRequestLegs(legs)[0].average_open_price).toBeNull();
    expect(toStrategyDraftLegs(legs)[0].average_open_price).toBeNull();
  });

  it("preserves a real zero entry price when restoring a position", () => {
    const quote = option("put", 95);
    const analysis = {
      positions: [{
        instrument: quote.instrument,
        quantity: 1,
        average_open_price: 0,
        current_quote: quote,
        market_value: 200,
        cost_basis: 0,
      }],
    } as PositionAnalysis;

    expect(draftFromAnalysis(analysis)[0].entryPrice).toBe(0);
  });

  it("explains when current chain filters omit required contracts", () => {
    const source = workspace();
    source.chain.contracts = source.chain.contracts.filter(
      (quote) => quote.instrument.option?.put_call === "call",
    );

    expect(() => buildTemplateDraft(template("iron_condor"), source)).toThrow(
      StrategyBuildError,
    );
  });
});
