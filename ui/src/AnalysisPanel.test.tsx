import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AnalysisPanel from "./AnalysisPanel";
import type { PositionAnalysis } from "./types";

function analysis(): PositionAnalysis {
  const complete = { value: "0", complete: true, missing_symbols: [] };
  return {
    provider_id: "fake",
    valuation_mode: "mark",
    positions: [{
      instrument: {
        asset_type: "equity", symbol: "SPY", provider_id: "fake",
        provider_symbol: "SPY", option: null,
      },
      quantity: 1,
      average_open_price: 100,
      current_quote: null,
      market_value: 200,
      cost_basis: 100,
    }],
    underlying_symbol: "SPY",
    underlying_price: 200,
    net_market_value: 200,
    net_cost_basis: 100,
    aggregate_greeks: {
      delta: complete, gamma: complete, theta: complete, vega: complete, rho: complete,
    },
    expiration_date: null,
    payoff_points: [],
    break_even_prices: [],
    max_profit: null,
    max_profit_bounded: null,
    max_loss: null,
    max_loss_bounded: null,
    scenarios: [{
      underlying_price: 220,
      underlying_change: 20,
      estimated_profit_loss: 20,
      method: "delta_gamma",
    }],
    assumptions: [],
    warnings: [],
  };
}

function render(source: PositionAnalysis): string {
  return renderToStaticMarkup(
    <AnalysisPanel analysis={source} loading={false} error={null} />,
  );
}

describe("combined position analysis", () => {
  it("converts a dollar move to percent using the starting underlying price", () => {
    const markup = render(analysis());

    expect(markup).toContain("+10.0%");
    expect(markup).not.toContain("2000%");
    expect(markup).toContain("Estimated change from today");
    expect(markup).toContain("P/L change");
  });

  it("uses a dollar move if a percentage would divide by zero", () => {
    const source = analysis();
    source.underlying_price = 0;

    const markup = render(source);

    expect(markup).not.toContain("Infinity");
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("%");
  });

  it("calls an entirely missing Greek unavailable instead of displaying false zero risk", () => {
    const source = analysis();
    source.aggregate_greeks.delta = {
      value: "0", complete: false, missing_symbols: ["SPY"],
    };

    const markup = render(source);

    expect(markup).toContain("Unavailable");
    expect(markup).toContain("Missing delta: SPY");
    expect(markup).not.toContain("<span>delta</span><strong>0.00</strong>");
  });

  it("labels incomplete exposure sums as partial", () => {
    const source = analysis();
    source.aggregate_greeks.delta = {
      value: "14.5", complete: false, missing_symbols: ["SPY_OPTION"],
    };

    const markup = render(source);

    expect(markup).toContain("14.50");
    expect(markup).toContain("Partial");
  });
});
