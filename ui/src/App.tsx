import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  addWatchlistSymbol,
  analyzePositions,
  ApiError,
  deleteStrategyDraft,
  deleteWatchlistSymbol,
  loadPriceHistory,
  loadStrategyDrafts,
  loadWatchlist,
  loadStrategies,
  loadWorkspace,
  saveStrategyDraft,
} from "./api";
import AnalysisPanel from "./AnalysisPanel";
import PositionWorkbench from "./PositionWorkbench";
import MobileAppHelp, { AppPreferences } from "./MobileAppHelp";
import { fromProviderAnalysis } from "./research";
import type { WorkbenchSetup } from "./workbenchState";
import PriceHistoryChart from "./PriceHistoryChart";
import {
  buildChainRows,
  daysToExpiration,
  decimal,
  filterChainRows,
  moneynessPercent,
  sortChainRows,
  spreadPercent,
} from "./chain";
import { DEFAULT_PRICE_INDICATORS } from "./history";
import type {
  ChainFilters,
  MoneynessRange,
  SortDirection,
  SortKey,
} from "./chain";
import {
  buildTemplateDraft,
  draftFromAnalysis,
  draftFromQuote,
  nextExpiration,
  requiresSecondaryExpiration,
  StrategyBuildError,
  toAnalysisRequestLegs,
  toStrategyDraftLegs,
} from "./strategies";
import type { DraftLeg } from "./strategies";
import type {
  DecimalValue,
  HistoryResolution,
  PositionAnalysis,
  PriceHistorySnapshot,
  PutCall,
  Quote,
  StrategyDraft,
  StrategyTemplate,
  WorkspaceSnapshot,
} from "./types";
import {
  applyThemePreference,
  loadFontScale,
  loadThemePreference,
  persistFontScale,
  persistThemePreference,
} from "./preferences";
import type { FontScale, ThemePreference } from "./preferences";
import WarningDisclosure from "./WarningDisclosure";

function money(value: DecimalValue | null | undefined): string {
  const parsed = decimal(value);
  return parsed === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(parsed);
}

function number(value: DecimalValue | null | undefined, digits = 2): string {
  const parsed = decimal(value);
  return parsed === null ? "—" : parsed.toFixed(digits);
}

function compact(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "—"
    : Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

function quoteCell(quote: Quote | undefined, field: "bid" | "ask" | "mark") {
  return quote ? money(quote[field]) : "—";
}

function spread(quote: Quote | undefined): string {
  const value = spreadPercent(quote);
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function percent(value: DecimalValue | null | undefined, digits = 1): string {
  const parsed = decimal(value);
  return parsed === null ? "—" : `${(parsed * 100).toFixed(digits)}%`;
}

function MarketExplorer({
  onOpenResearch,
}: {
  onOpenResearch: (analysis: PositionAnalysis, name: string) => void;
}) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");
  const [symbolInput, setSymbolInput] = useState("");
  const [expiration, setExpiration] = useState("");
  const [putCall, setPutCall] = useState<PutCall | "all">("all");
  const [strategies, setStrategies] = useState<StrategyTemplate[]>([]);
  const [strategyId, setStrategyId] = useState("long_call");
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyResolution, setHistoryResolution] =
    useState<HistoryResolution>("1d");
  const [priceHistory, setPriceHistory] = useState<PriceHistorySnapshot | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(true);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [strikeFromInput, setStrikeFromInput] = useState("");
  const [strikeToInput, setStrikeToInput] = useState("");
  const [strikeRange, setStrikeRange] = useState<{
    from?: number;
    to?: number;
  }>({});
  const [moneynessRange, setMoneynessRange] = useState<MoneynessRange>("all");
  const [minOpenInterest, setMinOpenInterest] = useState(0);
  const [maxSpreadPercent, setMaxSpreadPercent] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("strike");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [draftLegs, setDraftLegs] = useState<DraftLeg[]>([]);
  const [analysis, setAnalysis] = useState<PositionAnalysis | null>(null);
  const [valuationMode, setValuationMode] = useState<
    "mark" | "midpoint" | "liquidation"
  >("mark");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<StrategyDraft[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftsBusy, setDraftsBusy] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const strategyRequest = useRef(0);
  const draftRestoreSequence = useRef(0);
  const draftRestoreController = useRef<AbortController | null>(null);
  const symbolDrafts = useRef(
    new Map<string, { legs: DraftLeg[]; name: string; strategy: string }>(),
  );

  useEffect(() => () => draftRestoreController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    loadWatchlist(controller.signal)
      .then((loadedSymbols) => {
        setSymbols(loadedSymbols);
        setSelectedSymbol((current) =>
          loadedSymbols.includes(current) ? current : (loadedSymbols[0] ?? ""),
        );
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setWatchlistError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the watchlist.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setWatchlistBusy(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadStrategyDrafts(controller.signal)
      .then(setSavedDrafts)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setDraftsError(
          reason instanceof Error
            ? reason.message
            : "Unable to load saved drafts.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDraftsBusy(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadStrategies(controller.signal)
      .then(setStrategies)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setAnalysisError(
          reason instanceof Error
            ? reason.message
            : "Unable to load strategy templates.",
        );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    strategyRequest.current += 1;
    setStrategyLoading(false);
    if (!selectedSymbol) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadWorkspace(
      selectedSymbol,
      {
        expiration: expiration || undefined,
        putCall,
        strikeFrom: strikeRange.from,
        strikeTo: strikeRange.to,
      },
      controller.signal,
    )
      .then((snapshot) => {
        setWorkspace(snapshot);
        if (!expiration && snapshot.expirations.length) {
          setExpiration(snapshot.expirations[0]);
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        const message =
          reason instanceof ApiError || reason instanceof Error
            ? reason.message
            : "Unable to load market data.";
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [expiration, putCall, selectedSymbol, strikeRange.from, strikeRange.to]);

  useEffect(() => {
    if (!selectedSymbol) {
      setPriceHistory(null);
      setHistoryLoading(false);
      return;
    }
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistoryError(null);
    setPriceHistory(null);
    loadPriceHistory(selectedSymbol, historyResolution, {
      indicators: DEFAULT_PRICE_INDICATORS.map((indicator) => indicator.spec),
      signal: controller.signal,
    })
      .then(setPriceHistory)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setPriceHistory(null);
        setHistoryError(
          reason instanceof Error
            ? reason.message
            : "Unable to load price history.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [historyResolution, selectedSymbol]);

  useEffect(() => {
    if (!draftLegs.length) {
      setAnalysis(null);
      setAnalysisLoading(false);
      return;
    }
    const controller = new AbortController();
    setAnalysisLoading(true);
    setAnalysisError(null);
    analyzePositions(
      toAnalysisRequestLegs(draftLegs),
      draftLegs[0].quote.provider_id,
      controller.signal,
      valuationMode,
    )
      .then(setAnalysis)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setAnalysis(null);
        setAnalysisError(
          reason instanceof Error
            ? reason.message
            : "Unable to analyze the draft.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalysisLoading(false);
      });
    return () => controller.abort();
  }, [draftLegs, valuationMode]);

  const rows = useMemo(() => {
    const filters: ChainFilters = {
      moneynessRange,
      minOpenInterest,
      maxSpreadPercent,
    };
    const paired = buildChainRows(workspace?.chain.contracts ?? []);
    return sortChainRows(
      filterChainRows(paired, decimal(workspace?.quote.mark), filters),
      sortKey,
      sortDirection,
    );
  }, [
    maxSpreadPercent,
    minOpenInterest,
    moneynessRange,
    sortDirection,
    sortKey,
    workspace,
  ]);

  const selectedContracts = useMemo(
    () => new Set(draftLegs.map((leg) => leg.quote.instrument.provider_symbol)),
    [draftLegs],
  );

  async function addSymbol(event: FormEvent) {
    event.preventDefault();
    const normalized = symbolInput.trim().toUpperCase();
    if (!normalized) return;
    setWatchlistBusy(true);
    setWatchlistError(null);
    try {
      setSymbols(await addWatchlistSymbol(normalized));
      selectSymbol(normalized);
      setSymbolInput("");
    } catch (reason) {
      setWatchlistError(
        reason instanceof Error ? reason.message : "Unable to add the symbol.",
      );
    } finally {
      setWatchlistBusy(false);
    }
  }

  async function removeSymbol(symbol: string) {
    setWatchlistBusy(true);
    setWatchlistError(null);
    try {
      const remaining = await deleteWatchlistSymbol(symbol);
      setSymbols(remaining);
      if (selectedSymbol === symbol) {
        selectSymbol(remaining[0] ?? "");
      }
    } catch (reason) {
      setWatchlistError(
        reason instanceof Error
          ? reason.message
          : "Unable to remove the symbol.",
      );
    } finally {
      setWatchlistBusy(false);
    }
  }

  function selectSymbol(symbol: string) {
    if (symbol === selectedSymbol) return;
    cancelDraftRestore();
    rememberCurrentDraft();
    setSelectedSymbol(symbol);
    resetSymbolWorkspace();
    const retained = symbolDrafts.current.get(symbol);
    if (retained) {
      setDraftLegs(retained.legs);
      setDraftName(retained.name);
      setStrategyId(retained.strategy);
    }
  }

  function rememberCurrentDraft() {
    if (selectedSymbol)
      symbolDrafts.current.set(selectedSymbol, {
        legs: draftLegs,
        name: draftName,
        strategy: strategyId,
      });
  }

  function cancelDraftRestore() {
    if (!draftRestoreController.current) return;
    draftRestoreController.current.abort();
    draftRestoreController.current = null;
    draftRestoreSequence.current += 1;
    setDraftsBusy(false);
  }

  function resetSymbolWorkspace() {
    setExpiration("");
    setWorkspace(null);
    setAnalysis(null);
    setAnalysisError(null);
    setDraftLegs([]);
    setDraftName("");
    setStrikeFromInput("");
    setStrikeToInput("");
    setStrikeRange({});
    setFilterError(null);
  }

  function applyStrikeRange(event: FormEvent) {
    event.preventDefault();
    const from = strikeFromInput ? Number(strikeFromInput) : undefined;
    const to = strikeToInput ? Number(strikeToInput) : undefined;
    if (
      (from !== undefined && (!Number.isFinite(from) || from <= 0)) ||
      (to !== undefined && (!Number.isFinite(to) || to <= 0)) ||
      (from !== undefined && to !== undefined && from > to)
    ) {
      setFilterError("Enter a valid strike range with the lower value first.");
      return;
    }
    setFilterError(null);
    setStrikeRange({ from, to });
  }

  function changeSort(next: SortKey) {
    if (sortKey === next) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDirection("asc");
    }
  }

  function sortLabel(key: SortKey): string {
    return sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
  }

  function toggleContract(contract: Quote | undefined) {
    if (!contract) return;
    cancelDraftRestore();
    const symbol = contract.instrument.provider_symbol;
    setStrategyId("custom");
    setDraftName("");
    try {
      const alreadySelected = draftLegs.some(
        (leg) => leg.quote.instrument.provider_symbol === symbol,
      );
      const addedLeg = alreadySelected ? null : draftFromQuote(contract);
      setDraftLegs((current) =>
        alreadySelected
          ? current.filter(
              (leg) => leg.quote.instrument.provider_symbol !== symbol,
            )
          : [...current, addedLeg!],
      );
      setAnalysisError(null);
    } catch (reason) {
      setAnalysisError(
        reason instanceof Error
          ? reason.message
          : "This contract has no usable quote.",
      );
    }
  }

  function updateDraftLeg(
    symbol: string,
    update: Partial<Pick<DraftLeg, "action" | "quantity" | "entryPrice">>,
  ) {
    cancelDraftRestore();
    setDraftLegs((current) =>
      current.map((leg) =>
        leg.quote.instrument.provider_symbol === symbol
          ? { ...leg, ...update }
          : leg,
      ),
    );
  }

  async function selectStrategy(template: StrategyTemplate) {
    cancelDraftRestore();
    const requestId = ++strategyRequest.current;
    setStrategyId(template.template_id);
    setDraftName("");
    setAnalysisError(null);
    if (!workspace) return;
    setStrategyLoading(true);
    try {
      let secondaryWorkspace: WorkspaceSnapshot | undefined;
      if (requiresSecondaryExpiration(template)) {
        const nearExpiration =
          expiration ||
          workspace.chain.contracts[0]?.instrument.option?.expiration_date;
        const laterExpiration = nextExpiration(
          workspace.expirations,
          nearExpiration,
        );
        if (!laterExpiration) {
          throw new StrategyBuildError(
            "No later expiration is available for this strategy.",
          );
        }
        secondaryWorkspace = await loadWorkspace(selectedSymbol, {
          expiration: laterExpiration,
          putCall: "call",
          strikeFrom: strikeRange.from,
          strikeTo: strikeRange.to,
        });
      }
      if (requestId !== strategyRequest.current) return;
      setDraftLegs(
        buildTemplateDraft(template, workspace, draftLegs, secondaryWorkspace),
      );
    } catch (reason) {
      if (requestId !== strategyRequest.current) return;
      setAnalysisError(
        reason instanceof StrategyBuildError || reason instanceof Error
          ? reason.message
          : "Unable to build this strategy from the loaded chain.",
      );
    } finally {
      if (requestId === strategyRequest.current) setStrategyLoading(false);
    }
  }

  async function saveCurrentDraft(event: FormEvent) {
    event.preventDefault();
    if (!draftLegs.length) {
      setDraftsError("Add at least one position leg before saving.");
      return;
    }
    const normalizedName = draftName.trim();
    if (!normalizedName) {
      setDraftsError("Enter a name for this strategy draft.");
      return;
    }
    const first = draftLegs[0].quote;
    const underlyingSymbol =
      first.instrument.option?.underlying_symbol ?? first.instrument.symbol;
    setDraftsBusy(true);
    setDraftsError(null);
    try {
      const saved = await saveStrategyDraft({
        name: normalizedName,
        underlying_symbol: underlyingSymbol,
        provider_id: first.provider_id,
        strategy_template_id: strategyId || null,
        legs: toStrategyDraftLegs(draftLegs),
      });
      setDraftName(saved.name);
      setSavedDrafts((current) => [
        saved,
        ...current.filter((item) => item.draft_id !== saved.draft_id),
      ]);
    } catch (reason) {
      setDraftsError(
        reason instanceof Error ? reason.message : "Unable to save the draft.",
      );
    } finally {
      setDraftsBusy(false);
    }
  }

  async function loadSavedDraft(draft: StrategyDraft) {
    cancelDraftRestore();
    const restoreId = ++draftRestoreSequence.current;
    const controller = new AbortController();
    draftRestoreController.current = controller;
    strategyRequest.current += 1;
    setStrategyLoading(false);
    setDraftsBusy(true);
    setDraftsError(null);
    try {
      const restoredAnalysis = await analyzePositions(
        draft.legs.map((leg) => ({
          symbol: leg.provider_symbol,
          asset_type: leg.asset_type,
          quantity: leg.quantity,
          average_open_price: leg.average_open_price,
        })),
        draft.provider_id,
        controller.signal,
        valuationMode,
      );
      if (
        controller.signal.aborted ||
        restoreId !== draftRestoreSequence.current
      )
        return;
      const restoredLegs = draftFromAnalysis(restoredAnalysis);
      rememberCurrentDraft();
      resetSymbolWorkspace();
      setSelectedSymbol(draft.underlying_symbol);
      setStrategyId(draft.strategy_template_id ?? "custom");
      setDraftName(draft.name);
      // Quotes hydrate the legs; the regular effect values them using the
      // current mode, which may have changed while this restore was pending.
      setAnalysisLoading(true);
      setDraftLegs(restoredLegs);
    } catch (reason) {
      if (
        controller.signal.aborted ||
        restoreId !== draftRestoreSequence.current
      )
        return;
      setDraftsError(
        reason instanceof Error
          ? reason.message
          : "Unable to restore the draft.",
      );
    } finally {
      if (restoreId === draftRestoreSequence.current) {
        draftRestoreController.current = null;
        setDraftsBusy(false);
      }
    }
  }

  async function removeSavedDraft(draft: StrategyDraft) {
    setDraftsBusy(true);
    setDraftsError(null);
    try {
      setSavedDrafts(await deleteStrategyDraft(draft.draft_id));
      if (draftName.toLocaleLowerCase() === draft.name.toLocaleLowerCase()) {
        setDraftName("");
      }
    } catch (reason) {
      setDraftsError(
        reason instanceof Error
          ? reason.message
          : "Unable to remove the draft.",
      );
    } finally {
      setDraftsBusy(false);
    }
  }

  const quote = workspace?.quote;
  const asOf = quote
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(quote.as_of))
    : "—";
  const warningCount =
    (workspace?.chain.warnings.length ?? 0) +
    (workspace?.chain.contracts.reduce(
      (total, contract) => total + contract.warnings.length,
      0,
    ) ?? 0);
  const freshness =
    workspace?.provider_id === "fake"
      ? "Deterministic fixture"
      : quote
        ? `${Math.max(0, Math.round((Date.now() - Date.parse(quote.as_of)) / 1000))}s old`
        : "Waiting for data";
  const selectedStrategy = strategies.find(
    (template) => template.template_id === strategyId,
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">OA</span>
          <div>
            <strong>Option Atlas</strong>
            <small>Research workspace</small>
          </div>
        </div>

        <div className="section-label">
          <span>Watchlist</span>
          <span>{watchlistBusy ? "…" : symbols.length}</span>
        </div>
        <form className="symbol-form" onSubmit={addSymbol}>
          <input
            aria-label="Add a stock symbol"
            autoComplete="off"
            maxLength={12}
            onChange={(event) => setSymbolInput(event.target.value)}
            placeholder="Add symbol"
            value={symbolInput}
          />
          <button
            aria-label="Add symbol"
            disabled={watchlistBusy}
            type="submit"
          >
            +
          </button>
        </form>

        <nav className="watchlist" aria-label="Stock watchlist">
          {symbols.map((symbol) => (
            <div
              className={`watch-row ${selectedSymbol === symbol ? "active" : ""}`}
              key={symbol}
            >
              <button
                className="symbol-button"
                onClick={() => selectSymbol(symbol)}
                type="button"
              >
                <span>{symbol}</span>
                <small>
                  {symbol === selectedSymbol ? money(quote?.mark) : "View"}
                </small>
              </button>
              <button
                aria-label={`Remove ${symbol}`}
                className="remove-button"
                disabled={watchlistBusy}
                onClick={() => removeSymbol(symbol)}
                title={`Remove ${symbol}`}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </nav>

        <div className="connection-card">
          <span className="status-dot" />
          <div>
            <strong>{workspace?.provider_id ?? "Connecting"}</strong>
            <small>Read-only provider</small>
          </div>
        </div>
      </aside>

      <main
        aria-busy={
          loading || historyLoading || analysisLoading || strategyLoading
        }
        id="main-content"
        tabIndex={-1}
      >
        <header className="topbar">
          <div>
            <span className="eyebrow">Market workspace</span>
            <h1>{selectedSymbol || "No symbol"}</h1>
          </div>
          <div aria-live="polite" className="market-status" role="status">
            <span className={`status-dot ${warningCount ? "warning" : ""}`} />
            {freshness} · {warningCount} warning{warningCount === 1 ? "" : "s"}
          </div>
        </header>

        {error || watchlistError || filterError || draftsError ? (
          <div className="error-banner" role="alert">
            {error ?? watchlistError ?? filterError ?? draftsError}
          </div>
        ) : null}

        <section className={`quote-hero ${loading ? "loading" : ""}`}>
          <div>
            <span className="eyebrow">Underlying mark</span>
            <div className="hero-price">{money(quote?.mark)}</div>
            <span className="as-of">As of {asOf}</span>
            <WarningDisclosure
              provenance={quote?.field_provenance}
              title="Underlying warnings"
              warnings={quote?.warnings ?? []}
            />
          </div>
          <div className="quote-grid">
            <div>
              <span>Bid</span>
              <strong>{money(quote?.bid)}</strong>
            </div>
            <div>
              <span>Ask</span>
              <strong>{money(quote?.ask)}</strong>
            </div>
            <div>
              <span>Last</span>
              <strong>{money(quote?.last)}</strong>
            </div>
            <div>
              <span>Volume</span>
              <strong>{compact(quote?.volume)}</strong>
            </div>
          </div>
        </section>

        <PriceHistoryChart
          error={historyError}
          history={priceHistory}
          loading={historyLoading}
          onResolutionChange={setHistoryResolution}
          resolution={historyResolution}
          symbol={selectedSymbol}
        />

        <section className="workspace-grid">
          <div className="panel chain-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Contract explorer</span>
                <h2>Option chain</h2>
              </div>
              <div className="filters">
                <select
                  aria-label="Expiration"
                  onChange={(event) => setExpiration(event.target.value)}
                  value={expiration}
                >
                  {(workspace?.expirations ?? []).map((date) => (
                    <option key={date} value={date}>
                      {date} · {daysToExpiration(date)} DTE
                    </option>
                  ))}
                </select>
                <div className="segmented" aria-label="Option side">
                  {(["all", "call", "put"] as const).map((side) => (
                    <button
                      className={putCall === side ? "selected" : ""}
                      key={side}
                      onClick={() => setPutCall(side)}
                      type="button"
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="filter-bar">
              <form className="strike-range" onSubmit={applyStrikeRange}>
                <label>
                  <span>Strike from</span>
                  <input
                    min="0"
                    onChange={(event) => setStrikeFromInput(event.target.value)}
                    placeholder="Any"
                    step="0.5"
                    type="number"
                    value={strikeFromInput}
                  />
                </label>
                <label>
                  <span>Strike to</span>
                  <input
                    min="0"
                    onChange={(event) => setStrikeToInput(event.target.value)}
                    placeholder="Any"
                    step="0.5"
                    type="number"
                    value={strikeToInput}
                  />
                </label>
                <button type="submit">Apply</button>
              </form>
              <label>
                <span>Moneyness</span>
                <select
                  onChange={(event) =>
                    setMoneynessRange(event.target.value as MoneynessRange)
                  }
                  value={moneynessRange}
                >
                  <option value="all">All strikes</option>
                  <option value="2.5">Within 2.5%</option>
                  <option value="5">Within 5%</option>
                  <option value="10">Within 10%</option>
                </select>
              </label>
              <label>
                <span>Minimum OI</span>
                <select
                  onChange={(event) =>
                    setMinOpenInterest(Number(event.target.value))
                  }
                  value={minOpenInterest}
                >
                  <option value="0">Any</option>
                  <option value="100">100+</option>
                  <option value="500">500+</option>
                  <option value="1000">1,000+</option>
                </select>
              </label>
              <label>
                <span>Maximum spread</span>
                <select
                  onChange={(event) =>
                    setMaxSpreadPercent(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  value={maxSpreadPercent ?? ""}
                >
                  <option value="">Any</option>
                  <option value="5">5%</option>
                  <option value="10">10%</option>
                  <option value="25">25%</option>
                </select>
              </label>
            </div>

            <div className="chain-meta">
              <span>{rows.length} strikes shown</span>
              <span>Tap + to add a contract to the draft</span>
              <span className="mobile-chain-hint">
                Swipe the chain to compare calls and puts →
              </span>
              <WarningDisclosure
                title="Chain warnings"
                warnings={workspace?.chain.warnings ?? []}
              />
            </div>

            <div
              className="table-wrap"
              aria-label="Scrollable option chain"
              role="region"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  Calls and puts for {selectedSymbol} expiring {expiration}
                </caption>
                <thead>
                  <tr>
                    <th colSpan={7}>Calls</th>
                    <th className="strike-heading">Strike</th>
                    <th colSpan={7}>Puts</th>
                  </tr>
                  <tr className="subhead">
                    <th />
                    <th>Delta</th>
                    <th
                      aria-sort={
                        sortKey === "call_iv"
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="sort-button"
                        onClick={() => changeSort("call_iv")}
                        type="button"
                      >
                        IV{sortLabel("call_iv")}
                      </button>
                    </th>
                    <th>Bid</th>
                    <th>Ask</th>
                    <th>Spread</th>
                    <th
                      aria-sort={
                        sortKey === "call_open_interest"
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="sort-button"
                        onClick={() => changeSort("call_open_interest")}
                        type="button"
                      >
                        OI{sortLabel("call_open_interest")}
                      </button>
                    </th>
                    <th
                      aria-sort={
                        sortKey === "strike"
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="sort-button"
                        onClick={() => changeSort("strike")}
                        type="button"
                      >
                        Price{sortLabel("strike")}
                      </button>
                    </th>
                    <th />
                    <th>Delta</th>
                    <th
                      aria-sort={
                        sortKey === "put_iv"
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="sort-button"
                        onClick={() => changeSort("put_iv")}
                        type="button"
                      >
                        IV{sortLabel("put_iv")}
                      </button>
                    </th>
                    <th>Bid</th>
                    <th>Ask</th>
                    <th>Spread</th>
                    <th
                      aria-sort={
                        sortKey === "put_open_interest"
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="sort-button"
                        onClick={() => changeSort("put_open_interest")}
                        type="button"
                      >
                        OI{sortLabel("put_open_interest")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.strike}>
                      <td>
                        {row.call ? (
                          <div className="contract-actions">
                            <button
                              aria-label={`Toggle call at ${row.strike}`}
                              aria-pressed={selectedContracts.has(
                                row.call.instrument.provider_symbol,
                              )}
                              className={`contract-picker ${selectedContracts.has(row.call.instrument.provider_symbol) ? "selected" : ""}`}
                              onClick={() => toggleContract(row.call)}
                              type="button"
                            >
                              +
                            </button>
                            <WarningDisclosure
                              compact
                              provenance={row.call.field_provenance}
                              title={`${row.call.instrument.provider_symbol} warnings`}
                              warnings={row.call.warnings}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td>{number(row.call?.greeks?.delta)}</td>
                      <td>{percent(row.call?.implied_volatility)}</td>
                      <td>{quoteCell(row.call, "bid")}</td>
                      <td>{quoteCell(row.call, "ask")}</td>
                      <td>{spread(row.call)}</td>
                      <td>{compact(row.call?.open_interest)}</td>
                      <td className="strike">
                        <strong>{money(row.strike)}</strong>
                        <small>
                          {moneynessPercent(
                            row.strike,
                            decimal(quote?.mark),
                          )?.toFixed(1) ?? "—"}
                          %
                        </small>
                      </td>
                      <td>
                        {row.put ? (
                          <div className="contract-actions">
                            <button
                              aria-label={`Toggle put at ${row.strike}`}
                              aria-pressed={selectedContracts.has(
                                row.put.instrument.provider_symbol,
                              )}
                              className={`contract-picker ${selectedContracts.has(row.put.instrument.provider_symbol) ? "selected" : ""}`}
                              onClick={() => toggleContract(row.put)}
                              type="button"
                            >
                              +
                            </button>
                            <WarningDisclosure
                              compact
                              provenance={row.put.field_provenance}
                              title={`${row.put.instrument.provider_symbol} warnings`}
                              warnings={row.put.warnings}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td>{number(row.put?.greeks?.delta)}</td>
                      <td>{percent(row.put?.implied_volatility)}</td>
                      <td>{quoteCell(row.put, "bid")}</td>
                      <td>{quoteCell(row.put, "ask")}</td>
                      <td>{spread(row.put)}</td>
                      <td>{compact(row.put?.open_interest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && rows.length === 0 ? (
                <div className="empty-state">
                  No contracts match these filters.
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel strategy-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Position lab</span>
                <h2>Strategy setup</h2>
              </div>
              <span className="coming-soon">
                {strategyLoading ? "loading…" : `${draftLegs.length} legs`}
              </span>
            </div>
            <div className="strategy-list">
              {strategies.map((template) => (
                <button
                  className={
                    strategyId === template.template_id ? "active" : ""
                  }
                  disabled={loading || strategyLoading}
                  key={template.template_id}
                  onClick={() => selectStrategy(template)}
                  type="button"
                >
                  <span>
                    <strong>{template.display_name}</strong>
                    <small>
                      {template.outlook} · {template.legs.length || "any"} legs
                    </small>
                  </span>
                  <span>→</span>
                </button>
              ))}
            </div>
            <section
              className="saved-drafts"
              aria-labelledby="saved-drafts-heading"
            >
              <div className="draft-heading">
                <span className="eyebrow" id="saved-drafts-heading">
                  Saved setups
                </span>
                <span>{draftsBusy ? "…" : savedDrafts.length}</span>
              </div>
              <form className="draft-save-form" onSubmit={saveCurrentDraft}>
                <input
                  aria-label="Strategy draft name"
                  maxLength={80}
                  onChange={(event) => {
                    cancelDraftRestore();
                    setDraftName(event.target.value);
                  }}
                  placeholder="Name this setup"
                  value={draftName}
                />
                <button
                  disabled={draftsBusy || !draftLegs.length}
                  type="submit"
                >
                  Save
                </button>
              </form>
              <p className="draft-empty">
                Drafts stay available when switching symbols in this session.
                Save a named setup to keep it after closing the browser.
              </p>
              <div className="saved-draft-list">
                {savedDrafts.map((draft) => (
                  <div className="saved-draft-row" key={draft.draft_id}>
                    <button
                      disabled={draftsBusy}
                      onClick={() => loadSavedDraft(draft)}
                      type="button"
                    >
                      <strong>{draft.name}</strong>
                      <small>
                        {draft.underlying_symbol} · {draft.legs.length} legs ·{" "}
                        {draft.provider_id}
                      </small>
                    </button>
                    <button
                      aria-label={`Delete saved draft ${draft.name}`}
                      className="leg-remove"
                      disabled={draftsBusy}
                      onClick={() => removeSavedDraft(draft)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <div className="draft-tray">
              <div className="draft-heading">
                <span className="eyebrow">Selected contracts</span>
                {draftLegs.length ? (
                  <button
                    onClick={() => {
                      cancelDraftRestore();
                      setDraftLegs([]);
                      setStrategyId("custom");
                      setDraftName("");
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {selectedStrategy ? (
                <p className="strategy-description">
                  {selectedStrategy.description}
                </p>
              ) : null}
              {draftLegs.length === 0 ? (
                <p className="draft-empty">
                  Choose a template or select contracts with the + buttons.
                </p>
              ) : (
                draftLegs.map((leg) => {
                  const terms = leg.quote.instrument.option;
                  const symbol = leg.quote.instrument.provider_symbol;
                  return (
                    <div className="draft-leg" key={symbol}>
                      <div className="leg-contract">
                        <strong>{terms ? money(terms.strike) : symbol}</strong>
                        <small>
                          {terms?.expiration_date} {terms?.put_call}
                        </small>
                      </div>
                      <select
                        aria-label={`Action for ${symbol}`}
                        onChange={(event) =>
                          updateDraftLeg(symbol, {
                            action: event.target.value as "buy" | "sell",
                          })
                        }
                        value={leg.action}
                      >
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                      <input
                        aria-label={`Quantity for ${symbol}`}
                        inputMode="numeric"
                        max="1000000"
                        min="1"
                        onChange={(event) =>
                          updateDraftLeg(symbol, {
                            quantity: Math.max(
                              1,
                              Number(event.target.value) || 1,
                            ),
                          })
                        }
                        type="number"
                        value={leg.quantity}
                      />
                      <input
                        aria-label={`Entry price for ${symbol}`}
                        inputMode="decimal"
                        min="0"
                        onChange={(event) =>
                          updateDraftLeg(symbol, {
                            entryPrice:
                              event.target.value === ""
                                ? null
                                : Math.max(0, Number(event.target.value) || 0),
                          })
                        }
                        step="0.01"
                        type="number"
                        value={leg.entryPrice ?? ""}
                      />
                      <button
                        aria-label={`Remove ${symbol} from draft`}
                        className="leg-remove"
                        onClick={() => toggleContract(leg.quote)}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="research-transfer">
              <label>
                <span className="eyebrow">Current valuation</span>
                <select
                  aria-label="Current valuation"
                  value={valuationMode}
                  onChange={(event) =>
                    setValuationMode(event.target.value as typeof valuationMode)
                  }
                >
                  <option value="mark">Provider mark</option>
                  <option value="midpoint">Bid / ask midpoint</option>
                  <option value="liquidation">Close at bid / ask</option>
                </select>
              </label>
              <button
                type="button"
                disabled={
                  !analysis ||
                  analysisLoading ||
                  strategyLoading ||
                  draftsBusy ||
                  !!analysisError
                }
                onClick={() => {
                  if (!analysis) return;
                  try {
                    onOpenResearch(
                      analysis,
                      draftName || `${selectedSymbol} position`,
                    );
                  } catch (reason) {
                    setAnalysisError(
                      reason instanceof Error
                        ? reason.message
                        : "Unable to open this position.",
                    );
                  }
                }}
              >
                Open in position workbench →
              </button>
              <small>
                Review cost basis, explore time and volatility, and write a
                trading plan.
              </small>
            </div>
            <AnalysisPanel
              analysis={analysis}
              error={analysisError}
              loading={analysisLoading}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function App() {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    try {
      return loadThemePreference(window.localStorage);
    } catch {
      return "system";
    }
  });
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    try {
      return loadFontScale(window.localStorage);
    } catch {
      return 100;
    }
  });
  const [view, setView] = useState<"workbench" | "market">("workbench");
  const [marketVisited, setMarketVisited] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const scrollPositions = useRef({ workbench: 0, market: 0 });
  const [importedSetup, setImportedSetup] = useState<WorkbenchSetup | null>(
    null,
  );
  useEffect(() => {
    applyThemePreference(document.documentElement, theme);
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateBrowserTheme = () => {
      const dark =
        theme === "dark" || (theme === "system" && systemTheme.matches);
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute("content", dark ? "#111b19" : "#ffffff");
      });
    };
    updateBrowserTheme();
    systemTheme.addEventListener("change", updateBrowserTheme);
    try {
      persistThemePreference(window.localStorage, theme);
    } catch {
      /* Theme still works when browser storage is unavailable. */
    }
    return () => systemTheme.removeEventListener("change", updateBrowserTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.fontScale = String(fontScale);
    try {
      persistFontScale(window.localStorage, fontScale);
    } catch {
      // Browser storage may be disabled; the in-memory preference still works.
    }
  }, [fontScale]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    let fullHeight = viewport?.height ?? window.innerHeight;
    const update = () => {
      const focused = document.activeElement;
      const editing =
        focused instanceof HTMLElement &&
        focused.matches(
          'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]',
        );
      const height = viewport?.height ?? window.innerHeight;
      if (!editing) fullHeight = height;
      const keyboard =
        editing &&
        (!viewport ||
          fullHeight - height > 120 ||
          window.innerHeight - height > 120);
      document.documentElement.classList.toggle("app-keyboard-open", keyboard);
    };
    const resetHeight = () => {
      fullHeight = window.innerHeight;
      update();
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    viewport?.addEventListener("resize", update);
    window.addEventListener("orientationchange", resetHeight);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", resetHeight);
      document.documentElement.classList.remove("app-keyboard-open");
    };
  }, []);

  function switchView(next: "workbench" | "market") {
    if (next === view) {
      window.scrollTo({ top: 0 });
      return;
    }
    scrollPositions.current[view] = window.scrollY;
    setView(next);
    if (next === "market") setMarketVisited(true);
    requestAnimationFrame(() =>
      window.scrollTo({ top: scrollPositions.current[next] }),
    );
  }

  function openResearch(analysis: PositionAnalysis, name: string) {
    const setup = fromProviderAnalysis(analysis, name);
    setImportedSetup(setup);
    scrollPositions.current.workbench = 0;
    setView("workbench");
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <a
        className="skip-link"
        href={view === "workbench" ? "#workbench-content" : "#main-content"}
      >
        Skip to workspace
      </a>
      <header className="app-navigation">
        <a
          className="app-wordmark"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            switchView("workbench");
          }}
        >
          <span className="brand-mark">OA</span>
          <span>
            Option Atlas<small>Your position, in perspective.</small>
          </span>
        </a>
        <nav className="app-view-tabs" aria-label="Workspace">
          <button
            type="button"
            aria-label="Position workbench"
            aria-current={view === "workbench" ? "page" : undefined}
            onClick={() => switchView("workbench")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M4 4v16h16M7 15l4-6 4 3 5-7" />
            </svg>
            <span className="app-tab-full">Position workbench</span>
            <span className="app-tab-short" aria-hidden="true">
              Workbench
            </span>
          </button>
          <button
            type="button"
            aria-label="Market explorer"
            aria-current={view === "market" ? "page" : undefined}
            onClick={() => switchView("market")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5M7 11l2-3 2 2 2-3" />
            </svg>
            <span className="app-tab-full">Market explorer</span>
            <span className="app-tab-short" aria-hidden="true">
              Market
            </span>
          </button>
        </nav>
        <div className="app-preferences">
          <AppPreferences
            theme={theme}
            onThemeChange={setTheme}
            fontScale={fontScale}
            onFontScaleChange={setFontScale}
          />
        </div>
        <MobileAppHelp
          theme={theme}
          onThemeChange={setTheme}
          fontScale={fontScale}
          onFontScaleChange={setFontScale}
        />
      </header>
      {!online ? (
        <div className="app-offline-status" role="status">
          <strong>You’re offline.</strong> Existing results remain visible.
          Reconnect to the running server before calculating or loading market
          data.
        </div>
      ) : null}
      <div hidden={view !== "workbench"}>
        <PositionWorkbench
          initialSetup={importedSetup}
          onImportApplied={() => setImportedSetup(null)}
        />
      </div>
      <div hidden={view !== "market"}>
        {marketVisited ? (
          <MarketExplorer onOpenResearch={openResearch} />
        ) : null}
      </div>
    </>
  );
}

export default App;
