import { decimal } from "./chain";
import type {
  AnalysisRequestLeg,
  PositionAnalysis,
  Quote,
  StrategyDraftLeg,
  StrategyTemplate,
  WorkspaceSnapshot,
} from "./types";

export interface DraftLeg {
  quote: Quote;
  action: "buy" | "sell";
  quantity: number;
  entryPrice: number | null;
}

export class StrategyBuildError extends Error {}

export function toAnalysisRequestLegs(legs: DraftLeg[]): AnalysisRequestLeg[] {
  return legs.map((leg) => ({
    symbol: leg.quote.instrument.provider_symbol,
    asset_type: leg.quote.instrument.asset_type,
    quantity: leg.action === "buy" ? leg.quantity : -leg.quantity,
    average_open_price: leg.entryPrice,
  }));
}

export function toStrategyDraftLegs(legs: DraftLeg[]): StrategyDraftLeg[] {
  return legs.map((leg) => ({
    symbol: leg.quote.instrument.symbol,
    provider_symbol: leg.quote.instrument.provider_symbol,
    asset_type: leg.quote.instrument.asset_type,
    quantity: leg.action === "buy" ? leg.quantity : -leg.quantity,
    average_open_price: leg.entryPrice,
  }));
}

export function draftFromAnalysis(analysis: PositionAnalysis): DraftLeg[] {
  return analysis.positions.map((position) => {
    const quantity = decimal(position.quantity);
    if (quantity === null || quantity === 0 || !position.current_quote) {
      throw new StrategyBuildError(
        `${position.instrument.provider_symbol} could not be restored from current data.`,
      );
    }
    return {
      quote: position.current_quote,
      action: quantity > 0 ? "buy" : "sell",
      quantity: Math.abs(quantity),
      entryPrice: decimal(position.average_open_price),
    };
  });
}

function entryPrice(quote: Quote): number {
  const mark = decimal(quote.mark);
  if (mark !== null) return mark;
  const bid = decimal(quote.bid);
  const ask = decimal(quote.ask);
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  const last = decimal(quote.last);
  if (last !== null) return last;
  throw new StrategyBuildError(
    `${quote.instrument.provider_symbol} has no usable entry price.`,
  );
}

export function draftFromQuote(
  quote: Quote,
  action: "buy" | "sell" = "buy",
  quantity = 1,
): DraftLeg {
  return { quote, action, quantity, entryPrice: entryPrice(quote) };
}

function optionQuotes(workspace: WorkspaceSnapshot, side: "call" | "put"): Quote[] {
  return workspace.chain.contracts
    .filter((quote) => quote.instrument.option?.put_call === side)
    .sort(
      (left, right) =>
        Number(left.instrument.option?.strike) - Number(right.instrument.option?.strike),
    );
}

function nearestIndex(quotes: Quote[], spot: number): number {
  if (!quotes.length) return -1;
  return quotes.reduce((best, quote, index) => {
    const distance = Math.abs(Number(quote.instrument.option?.strike) - spot);
    const bestDistance = Math.abs(
      Number(quotes[best].instrument.option?.strike) - spot,
    );
    return distance < bestDistance ? index : best;
  }, 0);
}

function requireQuote(quote: Quote | undefined, message: string): Quote {
  if (!quote) throw new StrategyBuildError(message);
  return quote;
}

function quoteBelow(quotes: Quote[], spot: number): Quote | undefined {
  return quotes.filter((quote) => Number(quote.instrument.option?.strike) < spot).at(-1);
}

function quoteAbove(quotes: Quote[], spot: number): Quote | undefined {
  return quotes.find((quote) => Number(quote.instrument.option?.strike) > spot);
}

function quoteAtStrike(quotes: Quote[], strike: number): Quote | undefined {
  return quotes.find(
    (quote) => Number(quote.instrument.option?.strike) === strike,
  );
}

function requireLaterExpiration(near: Quote, far: Quote): void {
  const nearDate = near.instrument.option?.expiration_date;
  const farDate = far.instrument.option?.expiration_date;
  if (!nearDate || !farDate || farDate <= nearDate) {
    throw new StrategyBuildError(
      "Load a longer expiration after the selected chain expiration.",
    );
  }
}

export function requiresSecondaryExpiration(template: StrategyTemplate): boolean {
  return new Set(
    template.legs.map((leg) => leg.expiration_order ?? 0),
  ).size > 1;
}

export function nextExpiration(
  expirations: string[],
  current: string | undefined,
): string | undefined {
  return [...expirations]
    .sort()
    .find((candidate) => !current || candidate > current);
}

function requireCompatibleWorkspace(
  primary: WorkspaceSnapshot,
  secondary: WorkspaceSnapshot | undefined,
  strategyName: string,
): WorkspaceSnapshot {
  if (!secondary) {
    throw new StrategyBuildError(
      `Load a second expiration for this ${strategyName}.`,
    );
  }
  if (
    secondary.symbol !== primary.symbol ||
    secondary.provider_id !== primary.provider_id
  ) {
    throw new StrategyBuildError(
      "Strategy legs must use the same underlying and market-data provider.",
    );
  }
  return secondary;
}

export function buildTemplateDraft(
  template: StrategyTemplate,
  workspace: WorkspaceSnapshot,
  existing: DraftLeg[] = [],
  secondaryWorkspace?: WorkspaceSnapshot,
): DraftLeg[] {
  if (template.template_id === "custom") return existing;
  const spot = decimal(workspace.quote.mark);
  if (spot === null) throw new StrategyBuildError("Underlying mark is unavailable.");
  const calls = optionQuotes(workspace, "call");
  const puts = optionQuotes(workspace, "put");
  const callIndex = nearestIndex(calls, spot);
  const putIndex = nearestIndex(puts, spot);

  switch (template.template_id) {
    case "long_call":
      return [
        draftFromQuote(requireQuote(calls[callIndex], "Load at least one call.")),
      ];
    case "long_put":
      return [draftFromQuote(requireQuote(puts[putIndex], "Load at least one put."))];
    case "covered_call": {
      const shortCall = calls.find(
        (quote) => Number(quote.instrument.option?.strike) >= spot,
      );
      return [
        draftFromQuote(workspace.quote, "buy", 100),
        draftFromQuote(
          requireQuote(shortCall, "Load a call at or above spot."),
          "sell",
        ),
      ];
    }
    case "protective_put": {
      const longPut = [...puts]
        .filter((quote) => Number(quote.instrument.option?.strike) <= spot)
        .at(-1);
      return [
        draftFromQuote(workspace.quote, "buy", 100),
        draftFromQuote(
          requireQuote(longPut, "Load a put at or below spot."),
        ),
      ];
    }
    case "collar":
      return [
        draftFromQuote(workspace.quote, "buy", 100),
        draftFromQuote(
          requireQuote(quoteBelow(puts, spot), "Load a put below spot."),
        ),
        draftFromQuote(
          requireQuote(quoteAbove(calls, spot), "Load a call above spot."),
          "sell",
        ),
      ];
    case "cash_secured_put":
      return [
        draftFromQuote(
          requireQuote(quoteBelow(puts, spot), "Load a put below spot."),
          "sell",
        ),
      ];
    case "bull_call_spread":
      return [
        draftFromQuote(requireQuote(calls[callIndex], "Load two adjacent calls.")),
        draftFromQuote(
          requireQuote(calls[callIndex + 1], "Load a higher call."),
          "sell",
        ),
      ];
    case "bear_put_spread":
      return [
        draftFromQuote(
          requireQuote(puts[putIndex - 1], "Load a lower put."),
          "sell",
        ),
        draftFromQuote(requireQuote(puts[putIndex], "Load two adjacent puts.")),
      ];
    case "long_straddle": {
      const longCall = requireQuote(calls[callIndex], "Load a call near spot.");
      const strike = Number(longCall.instrument.option?.strike);
      return [
        draftFromQuote(longCall),
        draftFromQuote(
          requireQuote(
            quoteAtStrike(puts, strike),
            "Load a put at the same strike as the near-money call.",
          ),
        ),
      ];
    }
    case "long_strangle":
      return [
        draftFromQuote(
          requireQuote(quoteBelow(puts, spot), "Load a put below spot."),
        ),
        draftFromQuote(
          requireQuote(quoteAbove(calls, spot), "Load a call above spot."),
        ),
      ];
    case "long_call_butterfly":
      return [
        draftFromQuote(requireQuote(calls[callIndex - 1], "Load calls around spot.")),
        draftFromQuote(
          requireQuote(calls[callIndex], "Load three adjacent calls."),
          "sell",
          2,
        ),
        draftFromQuote(requireQuote(calls[callIndex + 1], "Load calls around spot.")),
      ];
    case "iron_condor": {
      const lowerPuts = puts.filter(
        (quote) => Number(quote.instrument.option?.strike) < spot,
      );
      const higherCalls = calls.filter(
        (quote) => Number(quote.instrument.option?.strike) > spot,
      );
      return [
        draftFromQuote(
          requireQuote(lowerPuts.at(-2), "Load two put strikes below spot."),
        ),
        draftFromQuote(
          requireQuote(lowerPuts.at(-1), "Load two put strikes below spot."),
          "sell",
        ),
        draftFromQuote(
          requireQuote(higherCalls[0], "Load two call strikes above spot."),
          "sell",
        ),
        draftFromQuote(
          requireQuote(higherCalls[1], "Load two call strikes above spot."),
        ),
      ];
    }
    case "call_calendar": {
      const secondary = requireCompatibleWorkspace(
        workspace,
        secondaryWorkspace,
        "calendar",
      );
      const nearCall = requireQuote(calls[callIndex], "Load a call near spot.");
      const strike = Number(nearCall.instrument.option?.strike);
      const farCall = requireQuote(
        quoteAtStrike(optionQuotes(secondary, "call"), strike),
        "The longer expiration needs a call at the same strike.",
      );
      requireLaterExpiration(nearCall, farCall);
      return [draftFromQuote(nearCall, "sell"), draftFromQuote(farCall)];
    }
    case "call_diagonal": {
      const secondary = requireCompatibleWorkspace(
        workspace,
        secondaryWorkspace,
        "diagonal",
      );
      const nearCall = requireQuote(
        quoteAbove(calls, spot),
        "Load a near-term call above spot.",
      );
      const farCalls = optionQuotes(secondary, "call");
      const farCall = requireQuote(
        farCalls[nearestIndex(farCalls, spot)],
        "Load a longer-term call near spot.",
      );
      requireLaterExpiration(nearCall, farCall);
      return [draftFromQuote(nearCall, "sell"), draftFromQuote(farCall)];
    }
    default:
      throw new StrategyBuildError(`Unsupported strategy ${template.template_id}.`);
  }
}
