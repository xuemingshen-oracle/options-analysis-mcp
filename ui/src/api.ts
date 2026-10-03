import type {
  AnalysisRequestLeg,
  PositionAnalysis,
  PositionAnalysisResult,
  PriceHistoryResult,
  PriceHistorySnapshot,
  HistoryResolution,
  PutCall,
  StrategyCatalogResult,
  StrategyDraft,
  StrategyDraftDefinition,
  StrategyDraftListResult,
  StrategyDraftResult,
  StrategyTemplate,
  WatchlistResult,
  WorkspaceResult,
  WorkspaceSnapshot,
} from "./types";

interface WorkspaceQuery {
  expiration?: string;
  putCall?: PutCall | "all";
  strikeFrom?: number;
  strikeTo?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly category = "unknown",
  ) {
    super(message);
  }
}

export async function loadWorkspace(
  symbol: string,
  query: WorkspaceQuery,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshot> {
  const params = new URLSearchParams({ limit: "100" });
  if (query.expiration) params.set("expiration", query.expiration);
  if (query.putCall && query.putCall !== "all") {
    params.set("put_call", query.putCall);
  }
  if (query.strikeFrom !== undefined) {
    params.set("strike_from", String(query.strikeFrom));
  }
  if (query.strikeTo !== undefined) {
    params.set("strike_to", String(query.strikeTo));
  }
  const response = await fetch(
    `/api/v1/workspaces/${encodeURIComponent(symbol)}?${params}`,
    { signal },
  );
  const result = (await response.json()) as WorkspaceResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  if (!result.workspace) throw new ApiError("The API returned no workspace data.");
  return result.workspace;
}

export async function loadPriceHistory(
  symbol: string,
  resolution: HistoryResolution,
  options: {
    indicators?: readonly string[];
    signal?: AbortSignal;
  } = {},
): Promise<PriceHistorySnapshot> {
  const params = new URLSearchParams({ resolution });
  for (const indicator of options.indicators ?? []) {
    params.append("indicator", indicator);
  }
  const response = await fetch(
    `/api/v1/price-history/${encodeURIComponent(symbol)}?${params}`,
    { signal: options.signal },
  );
  const result = (await response.json()) as PriceHistoryResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  if (!result.history) throw new ApiError("The API returned no price history.");
  return result.history;
}

async function watchlistRequest(
  path: string,
  init?: RequestInit,
): Promise<string[]> {
  const response = await fetch(path, init);
  const result = (await response.json()) as WatchlistResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  return result.items.map((item) => item.symbol);
}

export function loadWatchlist(signal?: AbortSignal): Promise<string[]> {
  return watchlistRequest("/api/v1/watchlist", { signal });
}

export function addWatchlistSymbol(symbol: string): Promise<string[]> {
  return watchlistRequest("/api/v1/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
}

export function deleteWatchlistSymbol(symbol: string): Promise<string[]> {
  return watchlistRequest(`/api/v1/watchlist/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
  });
}

export async function loadStrategies(signal?: AbortSignal): Promise<StrategyTemplate[]> {
  const response = await fetch("/api/v1/strategies", { signal });
  const result = (await response.json()) as StrategyCatalogResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  return result.strategies;
}

export async function loadStrategyDrafts(
  signal?: AbortSignal,
): Promise<StrategyDraft[]> {
  const response = await fetch("/api/v1/strategy-drafts", { signal });
  const result = (await response.json()) as StrategyDraftListResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  return result.drafts;
}

export async function saveStrategyDraft(
  definition: StrategyDraftDefinition,
): Promise<StrategyDraft> {
  const response = await fetch("/api/v1/strategy-drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(definition),
  });
  const result = (await response.json()) as StrategyDraftResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  if (!result.draft) throw new ApiError("The API returned no saved draft.");
  return result.draft;
}

export async function deleteStrategyDraft(
  draftId: string,
): Promise<StrategyDraft[]> {
  const response = await fetch(
    `/api/v1/strategy-drafts/${encodeURIComponent(draftId)}`,
    { method: "DELETE" },
  );
  const result = (await response.json()) as StrategyDraftListResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  return result.drafts;
}

export async function analyzePositions(
  legs: AnalysisRequestLeg[],
  provider: string,
  signal?: AbortSignal,
  valuationMode: "mark" | "midpoint" | "liquidation" = "mark",
): Promise<PositionAnalysis> {
  const response = await fetch("/api/v1/analyses/positions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ legs, provider, valuation_mode: valuationMode }),
    signal,
  });
  const result = (await response.json()) as PositionAnalysisResult;
  if (!response.ok || result.error) {
    throw new ApiError(
      result.error?.message ?? `Request failed (${response.status})`,
      result.error?.category,
    );
  }
  if (!result.analysis) throw new ApiError("The API returned no analysis.");
  return result.analysis;
}
