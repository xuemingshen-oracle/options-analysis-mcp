import {
  ChangeEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  analyzeResearch,
  boundLabel,
  buildResearchRequest,
  decisionReminders,
  money,
  percent,
  reviewBrief,
  signedMoney,
} from "./research";
import type { ResearchAnalysis } from "./research";
import ResearchChart from "./ResearchChart";
import {
  blankPlan,
  exampleSetup,
  loadWorkbench,
  mergeSavedSetups,
  newLeg,
  parseBackup,
  saveNamedSetup,
  serializeBackup,
  MAX_BACKUP_BYTES,
  WORKBENCH_STORAGE_KEY,
} from "./workbenchState";
import type {
  ExampleName,
  LegKind,
  TradePlan,
  WorkbenchLeg,
  WorkbenchSetup,
  WorkbenchState,
} from "./workbenchState";
import "./workbench.css";

interface Props {
  initialSetup?: WorkbenchSetup | null;
  onImportApplied?: () => void;
}

function Field({
  label,
  value,
  onChange,
  type = "number",
  min,
  max,
  step = "any",
  hint,
  className = "",
  maxLength = 80,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  hint?: string;
  className?: string;
  maxLength?: number;
}) {
  const hintId = useId();
  return (
    <label className={`wb-field ${className}`}>
      <span>{label}</span>
      <input
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
        type={type}
        inputMode={
          type === "number" && !min?.startsWith("-")
            ? step === "1"
              ? "numeric"
              : "decimal"
            : undefined
        }
        autoCapitalize={
          type === "text" && label === "Underlying" ? "characters" : undefined
        }
        autoCorrect="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        step={type === "number" ? step : undefined}
        maxLength={type === "text" ? maxLength : undefined}
      />
      {hint ? <small id={hintId}>{hint}</small> : null}
    </label>
  );
}

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pnlClass(value: string | number): string {
  return Number(value) < 0
    ? "wb-negative"
    : Number(value) > 0
      ? "wb-positive"
      : "";
}

function LegEditor({
  leg,
  index,
  date,
  onChange,
  onRemove,
}: {
  leg: WorkbenchLeg;
  index: number;
  date: string;
  onChange: (update: Partial<WorkbenchLeg>) => void;
  onRemove: () => void;
}) {
  const option = leg.kind !== "stock";
  const [expanded, setExpanded] = useState(
    index === 0 || leg.entryPrice === "",
  );
  const fieldsId = useId();
  return (
    <fieldset className={`wb-leg ${expanded ? "is-expanded" : "is-collapsed"}`}>
      <legend>Leg {index + 1}</legend>
      <div className="wb-leg-header">
        <strong className="wb-leg-desktop-title">
          <span className={`wb-leg-side ${leg.action}`}>
            {leg.action === "buy" ? "LONG" : "SHORT"}
          </span>{" "}
          {option
            ? `${leg.kind === "call" ? "Call" : "Put"} option`
            : "Stock / ETF"}
        </strong>
        <button
          className="wb-leg-expander"
          type="button"
          aria-label={`${expanded ? "Collapse" : "Edit"} leg ${index + 1}`}
          aria-expanded={expanded}
          aria-controls={fieldsId}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className={`wb-leg-side ${leg.action}`}>
            {leg.action === "buy" ? "LONG" : "SHORT"}
          </span>
          <span>
            <strong>
              {leg.quantity || "—"}{" "}
              {option
                ? `${leg.kind} · ${leg.strike ? money(leg.strike) : "strike needed"}`
                : "shares"}
            </strong>
            <small>
              {option ? `${leg.expiration || "Set expiration"} · ` : ""}Entry{" "}
              {leg.entryPrice === "" ? "needed" : money(leg.entryPrice, 2)}
            </small>
          </span>
          <span className="wb-leg-chevron" aria-hidden="true">
            {expanded ? "−" : "+"}
          </span>
        </button>
        <button
          type="button"
          className="wb-icon-button"
          onClick={onRemove}
          aria-label={`Remove leg ${index + 1}`}
          title={`Remove leg ${index + 1}`}
        >
          ×
        </button>
      </div>
      <div className="wb-leg-fields" id={fieldsId}>
        <label className="wb-field">
          <span>Instrument</span>
          <select
            value={leg.kind}
            onChange={(event) => {
              const kind = event.target.value as LegKind;
              onChange({
                kind,
                multiplier:
                  kind === "stock"
                    ? "1"
                    : leg.kind === "stock"
                      ? "100"
                      : leg.multiplier,
                quantity:
                  kind === "stock" && leg.quantity === "1"
                    ? "100"
                    : leg.quantity,
              });
            }}
          >
            <option value="call">Call</option>
            <option value="put">Put</option>
            <option value="stock">Stock / ETF</option>
          </select>
        </label>
        <label className="wb-field">
          <span>Direction</span>
          <select
            value={leg.action}
            onChange={(event) =>
              onChange({ action: event.target.value as "buy" | "sell" })
            }
          >
            <option value="buy">Long / buy</option>
            <option value="sell">Short / sell</option>
          </select>
        </label>
        <Field
          label={option ? "Contracts" : "Shares"}
          value={leg.quantity}
          onChange={(value) => onChange({ quantity: value })}
          min="0.000001"
          max="1000000"
          step={option ? "1" : "any"}
        />
        {option ? (
          <>
            <Field
              label="Strike ($)"
              value={leg.strike}
              onChange={(value) => onChange({ strike: value })}
              min="0.000001"
            />
            <Field
              label="Expiration"
              type="date"
              value={leg.expiration}
              onChange={(value) => onChange({ expiration: value })}
              min={date}
              className="wb-expiration-field"
            />
          </>
        ) : (
          <div className="wb-stock-note">
            Stock has no expiration.
            <br />
            Each share uses a 1× multiplier.
          </div>
        )}
        <Field
          label="Entry / unit ($)"
          value={leg.entryPrice}
          onChange={(value) => onChange({ entryPrice: value })}
          min="0"
          hint="Your actual fill"
        />
        <Field
          label="Mark / unit ($)"
          value={leg.currentMark}
          onChange={(value) => onChange({ currentMark: value })}
          min="0"
          hint="Optional; blank = model"
        />
        {option ? (
          <Field
            label="IV (%)"
            value={leg.volatility}
            onChange={(value) => onChange({ volatility: value })}
            min="0"
            max="500"
          />
        ) : null}
        {option ? (
          <Field
            label="Multiplier"
            value={leg.multiplier}
            onChange={(value) => onChange({ multiplier: value })}
            min="0.000001"
            max="10000"
          />
        ) : null}
      </div>
    </fieldset>
  );
}

function DecisionReview({
  analysis,
  setup,
}: {
  analysis: ResearchAnalysis;
  setup: WorkbenchSetup;
}) {
  const sizing = analysis.sizing;
  const planFindings = decisionReminders(setup, analysis.current_profit_loss);
  return (
    <section className="wb-card wb-review" aria-labelledby="wb-review-heading">
      <div className="wb-section-heading">
        <div>
          <span className="wb-kicker">Decision support</span>
          <h2 id="wb-review-heading">What deserves attention</h2>
        </div>
        <span className="wb-pill">Rule-based review</span>
      </div>
      <div className="wb-budget-result">
        <span>Loss budget</span>
        <strong>
          {sizing.risk_budget === null ? "Not set" : money(sizing.risk_budget)}
        </strong>
        <p>
          {sizing.max_position_units === null
            ? "Sizing needs a finite, defined maximum loss. A loss budget is not a margin estimate."
            : `${sizing.max_position_units} complete position ${sizing.max_position_units === 1 ? "unit fits" : "units fit"} this budget, using ${money(sizing.risk_per_position)} maximum loss per unit.`}
        </p>
        {sizing.budget_used_percent !== null ? (
          <span
            className={
              sizing.fits_budget === false ? "wb-negative" : "wb-muted"
            }
          >
            {Number(sizing.budget_used_percent).toFixed(1)}% of budget used by
            the entered position
          </span>
        ) : null}
      </div>
      <div className="wb-findings">
        {[...planFindings, ...analysis.findings].map((finding, index) => (
          <article
            className={`wb-finding ${finding.severity}`}
            key={`${finding.title}-${index}`}
          >
            <span className="wb-finding-marker" aria-hidden="true">
              {finding.severity === "danger"
                ? "!"
                : finding.severity === "caution"
                  ? "△"
                  : "i"}
            </span>
            <div>
              <h3>{finding.title}</h3>
              <p>{finding.detail}</p>
            </div>
          </article>
        ))}
        {!analysis.findings.length && !planFindings.length ? (
          <p className="wb-muted">
            No rule was triggered. Review your thesis and the model assumptions
            before making a decision.
          </p>
        ) : null}
      </div>
      <p className="wb-caption">
        Findings explain the entered position; they are not forecasts or trade
        recommendations.
      </p>
    </section>
  );
}

function Results({
  analysis,
  setup,
}: {
  analysis: ResearchAnalysis;
  setup: WorkbenchSetup;
}) {
  const [tableMode, setTableMode] = useState<"horizon" | "timeline">("horizon");
  const [basis, setBasis] = useState<
    "profit_loss" | "change_from_today" | "delta" | "gamma"
  >("profit_loss");
  const greekMetric = basis === "delta" || basis === "gamma";
  const timeline = analysis.timeline ?? [];
  return (
    <div className="wb-results">
      <div className="wb-metrics" aria-label="Position risk summary">
        <div className="wb-metric">
          <span>Current P/L · from entry</span>
          <strong className={pnlClass(analysis.current_profit_loss)}>
            {signedMoney(analysis.current_profit_loss)}
          </strong>
          <small>Entered marks or model · after fees</small>
        </div>
        <div className="wb-metric">
          <span>Expiration max loss</span>
          <strong
            className={
              analysis.max_loss_bounded === false ||
              Number(analysis.max_loss) < 0
                ? "wb-negative"
                : ""
            }
          >
            {boundLabel(analysis.max_loss, analysis.max_loss_bounded)}
          </strong>
          <small>
            {analysis.expiration_date ??
              (analysis.legs.every((leg) => leg.kind === "stock")
                ? "Stock position; no expiration"
                : "Mixed expirations; no exact bound")}
          </small>
        </div>
        <div className="wb-metric">
          <span>Expiration max profit</span>
          <strong>
            {boundLabel(analysis.max_profit, analysis.max_profit_bounded)}
          </strong>
          <small>
            {analysis.reward_risk_ratio === null
              ? "Full position, including fees"
              : `${Number(analysis.reward_risk_ratio).toFixed(2)}× reward / risk`}
          </small>
        </div>
        <div className="wb-metric">
          <span>Expiration break-even</span>
          <strong className="wb-break-even-value">
            {analysis.break_even_prices
              .map((value) => money(value, 2))
              .join(" · ") || "Not defined"}
          </strong>
          <small>Underlying price · after fees</small>
        </div>
      </div>

      <div className="wb-results-grid">
        <div className="wb-results-main">
          <section className="wb-card" aria-labelledby="wb-payoff-heading">
            <div className="wb-section-heading">
              <div>
                <span className="wb-kicker">The shape of the trade</span>
                <h2 id="wb-payoff-heading">Payoff & time horizon</h2>
              </div>
              <span className="wb-pill">
                {analysis.symbol} · {money(analysis.spot, 2)}
              </span>
            </div>
            <ResearchChart analysis={analysis} />
            <p className="wb-caption">
              Modeled sensitivities at {analysis.valuation_date} and spot{" "}
              {money(analysis.spot, 2)}. Use the date roadmap to inspect future
              delta and gamma.
            </p>
            <div className="wb-greeks" aria-label="Modeled position Greeks">
              <div>
                <span>Delta</span>
                <strong>
                  {Number(analysis.modeled_greeks.delta).toFixed(1)}
                </strong>
                <small>share equivalents</small>
              </div>
              <div>
                <span>Gamma</span>
                <strong>
                  {Number(analysis.modeled_greeks.gamma).toFixed(2)}
                </strong>
                <small>delta / $1 move</small>
              </div>
              <div>
                <span>Theta</span>
                <strong>{signedMoney(analysis.modeled_greeks.theta, 2)}</strong>
                <small>per day</small>
              </div>
              <div>
                <span>Vega</span>
                <strong>{signedMoney(analysis.modeled_greeks.vega, 2)}</strong>
                <small>per IV point</small>
              </div>
            </div>
          </section>

          <section className="wb-card" aria-labelledby="wb-scenarios-heading">
            <div className="wb-section-heading">
              <div>
                <span className="wb-kicker">Price × time</span>
                <h2 id="wb-scenarios-heading">Scenario roadmap</h2>
              </div>
              <div
                className="wb-segmented"
                role="group"
                aria-label="Scenario view"
              >
                <button
                  type="button"
                  aria-pressed={tableMode === "horizon"}
                  onClick={() => setTableMode("horizon")}
                >
                  Selected date
                </button>
                <button
                  type="button"
                  aria-pressed={tableMode === "timeline"}
                  onClick={() => setTableMode("timeline")}
                >
                  Across dates
                </button>
              </div>
            </div>
            <p className="wb-caption">
              {tableMode === "horizon"
                ? `At ${analysis.horizon_days} days forward (${analysis.horizon_date}),`
                : `Dates measured from ${analysis.valuation_date},`}{" "}
              with IV {Number(setup.ivShift) >= 0 ? "+" : ""}
              {setup.ivShift} percentage points. Values are scenarios, not
              probabilities.
            </p>
            {tableMode === "horizon" ? (
              <div className="wb-table-scroll wb-horizon-scroll">
                <table className="wb-table wb-horizon-table">
                  <caption className="sr-only">
                    Scenario P/L from entry and change from today at the
                    selected horizon
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Price move</th>
                      <th scope="col">Underlying</th>
                      <th scope="col">P/L from entry</th>
                      <th scope="col">Change from today</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.scenarios.map((row) => (
                      <tr
                        className={Number(row.move) === 0 ? "wb-at-spot" : ""}
                        key={String(row.move)}
                      >
                        <th scope="row">
                          {Number(row.move) > 0 ? "+" : ""}
                          {percent(row.move)}
                        </th>
                        <td data-label="Underlying">
                          {money(row.underlying_price, 2)}
                        </td>
                        <td
                          data-label="P/L from entry"
                          className={pnlClass(row.profit_loss)}
                        >
                          {signedMoney(row.profit_loss)}
                        </td>
                        <td
                          data-label="From today"
                          className={pnlClass(row.change_from_today)}
                        >
                          {signedMoney(row.change_from_today)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div className="wb-table-basis">
                  <span>Show:</span>
                  <div
                    className="wb-segmented"
                    role="group"
                    aria-label="Roadmap metric"
                  >
                    <button
                      type="button"
                      aria-pressed={basis === "profit_loss"}
                      onClick={() => setBasis("profit_loss")}
                    >
                      P/L from entry
                    </button>
                    <button
                      type="button"
                      aria-pressed={basis === "change_from_today"}
                      onClick={() => setBasis("change_from_today")}
                    >
                      From today
                    </button>
                    <button
                      type="button"
                      aria-pressed={basis === "delta"}
                      onClick={() => setBasis("delta")}
                    >
                      Delta
                    </button>
                    <button
                      type="button"
                      aria-pressed={basis === "gamma"}
                      onClick={() => setBasis("gamma")}
                    >
                      Gamma
                    </button>
                  </div>
                </div>
                {timeline.length ? (
                  <div
                    className="wb-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Scrollable date roadmap"
                  >
                    <table className="wb-table wb-roadmap">
                      <caption className="sr-only">
                        {basis === "profit_loss"
                          ? "Total profit and loss from entry"
                          : basis === "change_from_today"
                            ? "Value change from today"
                            : `Modeled ${basis}`}{" "}
                        by underlying price and future date
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Underlying</th>
                          {timeline.map((column) => (
                            <th scope="col" key={column.horizon_date}>
                              {column.horizon_date}
                              <small>+{column.horizon_days} days</small>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.scenarios.map((row, index) => (
                          <tr
                            key={String(row.move)}
                            className={
                              Number(row.move) === 0 ? "wb-at-spot" : ""
                            }
                          >
                            <th scope="row">
                              {money(row.underlying_price)}
                              <small>{percent(row.move)}</small>
                            </th>
                            {timeline.map((column) => {
                              const scenario = column.scenarios[index];
                              const value =
                                basis === "delta" || basis === "gamma"
                                  ? scenario?.modeled_greeks?.[basis]
                                  : scenario?.[basis];
                              const boundary =
                                greekMetric && scenario?.greek_boundary;
                              return (
                                <td
                                  className={
                                    value === undefined || greekMetric
                                      ? ""
                                      : `${pnlClass(value)} ${Number(value) < 0 ? "wb-heat-loss" : "wb-heat-gain"}`
                                  }
                                  key={column.horizon_date}
                                >
                                  {value === undefined || boundary
                                    ? "—"
                                    : greekMetric
                                      ? Number(value).toFixed(2)
                                      : signedMoney(value)}
                                  {boundary ? (
                                    <small>at model boundary</small>
                                  ) : null}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="wb-muted">
                    The analysis server did not return a date roadmap.
                  </p>
                )}
                <p className="wb-caption">
                  {greekMetric
                    ? "Delta is share-equivalent exposure; gamma is the change in delta per $1 move. Negative values are sensitivities, not losses. Greeks are hidden at expiry, zero-price or zero-volatility boundaries where model conventions can mislead. "
                    : ""}
                  Dates stop at the earliest option expiration. Positions after
                  assignment or expiration require a new set of legs.
                </p>
              </>
            )}
            <p className="wb-caption">
              “From entry” includes the entry debit/credit and fees. “From
              today” compares future model value with the entered current marks
              (or current model values when marks are blank).
            </p>
          </section>
        </div>
        <DecisionReview analysis={analysis} setup={setup} />
      </div>

      <details className="wb-card wb-breakdown">
        <summary>
          Position value & leg breakdown{" "}
          <span>Entry, current value, intrinsic and time value</span>
        </summary>
        <div className="wb-value-strip">
          <div>
            <span>
              Entry {Number(analysis.net_entry_value) >= 0 ? "debit" : "credit"}
            </span>
            <strong>
              {money(Math.abs(Number(analysis.net_entry_value)), 2)}
            </strong>
          </div>
          <div>
            <span>Current signed value</span>
            <strong>{money(analysis.current_value, 2)}</strong>
          </div>
          <div>
            <span>Current model value</span>
            <strong>{money(analysis.current_model_value, 2)}</strong>
          </div>
          <div>
            <span>Total fees reserved</span>
            <strong>{money(analysis.total_fees, 2)}</strong>
          </div>
        </div>
        {analysis.leg_breakdown?.length ? (
          <div className="wb-table-scroll">
            <table className="wb-table">
              <caption className="sr-only">
                Per-leg value breakdown. Intrinsic and time value are per
                underlying unit. Position values include quantities and
                multipliers.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Leg</th>
                  <th scope="col">Entry value</th>
                  <th scope="col">Current value</th>
                  <th scope="col">P/L before fees</th>
                  <th scope="col">Model / unit</th>
                  <th scope="col">Intrinsic / unit</th>
                  <th scope="col">Time value / unit</th>
                  <th scope="col">Effective IV</th>
                </tr>
              </thead>
              <tbody>
                {analysis.leg_breakdown.map((leg, index) => (
                  <tr key={leg.index}>
                    <th scope="row">
                      {index + 1}. {Number(leg.quantity) > 0 ? "Long" : "Short"}{" "}
                      {Math.abs(Number(leg.quantity))} {leg.kind}
                      <small>
                        {setup.legs[index]?.kind !== "stock"
                          ? `${money(setup.legs[index]?.strike)} · ${setup.legs[index]?.expiration}`
                          : analysis.symbol}
                      </small>
                    </th>
                    <td>{money(leg.entry_value, 2)}</td>
                    <td>{money(leg.current_value, 2)}</td>
                    <td className={pnlClass(leg.profit_loss)}>
                      {signedMoney(leg.profit_loss, 2)}
                    </td>
                    <td>{money(leg.model_price, 2)}</td>
                    <td>{money(leg.intrinsic_value, 2)}</td>
                    <td>{money(leg.extrinsic_value, 2)}</td>
                    <td>
                      {leg.kind === "stock" ? (
                        "—"
                      ) : (
                        <>
                          {percent(leg.implied_volatility)}
                          <small>
                            {leg.iv_source === "calibrated"
                              ? "Fitted to mark"
                              : "Entered"}
                          </small>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="wb-caption">
          Short-leg entry and current values are negative liabilities. Per-leg
          P/L excludes the fees reserved for the complete position. Intrinsic
          and time values use current entered marks or model prices.
        </p>
      </details>
      <details className="wb-card wb-assumptions">
        <summary>
          Model assumptions & limitations{" "}
          <span>{analysis.assumptions.length} assumptions</span>
        </summary>
        <ul>
          {analysis.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function PositionWorkbench({
  initialSetup,
  onImportApplied,
}: Props = {}) {
  const [state, setState] = useState<WorkbenchState>(() => {
    try {
      return loadWorkbench(window.localStorage);
    } catch {
      return { current: exampleSetup(), saved: [] };
    }
  });
  const [analysis, setAnalysis] = useState<ResearchAnalysis | null>(null);
  const [analysisKey, setAnalysisKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [undoState, setUndoState] = useState<WorkbenchState | null>(null);
  const [mobileSection, setMobileSection] = useState<
    "position" | "analysis" | "plan"
  >("position");
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const importedSetup = useRef<WorkbenchSetup | null>(null);
  const setup = state.current;
  const requestState = useMemo(() => {
    try {
      const request = buildResearchRequest(setup);
      return { request, key: JSON.stringify(request), validationError: null };
    } catch (reason) {
      return {
        request: null,
        key: "",
        validationError:
          reason instanceof Error
            ? reason.message
            : "Check the position inputs.",
      };
    }
  }, [setup]);
  const currentAnalysis =
    analysisKey && requestState.key === analysisKey ? analysis : null;
  const dirtyResults = analysis !== null && currentAnalysis === null;

  function openMobileSection(section: typeof mobileSection) {
    setMobileSection(section);
    if (window.matchMedia("(max-width: 760px)").matches) {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        focused.matches("input, textarea, select")
      )
        focused.blur();
      requestAnimationFrame(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
    }
  }

  function updateSetup(update: Partial<WorkbenchSetup>) {
    setState((current) => ({
      ...current,
      current: { ...current.current, ...update },
    }));
    setError(null);
  }
  function updatePlan(update: Partial<TradePlan>) {
    setState((current) => ({
      ...current,
      current: {
        ...current.current,
        plan: { ...current.current.plan, ...update },
      },
    }));
  }
  function changeLeg(id: string, update: Partial<WorkbenchLeg>) {
    setState((current) => ({
      ...current,
      current: {
        ...current.current,
        legs: current.current.legs.map((leg) =>
          leg.id === id ? { ...leg, ...update } : leg,
        ),
      },
    }));
    setError(null);
  }
  async function calculate(target = setup, reveal = false) {
    let request;
    try {
      request = buildResearchRequest(target);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Check the position inputs.",
      );
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const sequence = ++requestSequence.current;
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeResearch(request, abort.signal);
      if (sequence !== requestSequence.current) return;
      setAnalysis(result);
      setAnalysisKey(JSON.stringify(request));
      if (reveal) openMobileSection("analysis");
    } catch (reason) {
      if (abort.signal.aborted) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to calculate this position.",
      );
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    void calculate(state.current);
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        WORKBENCH_STORAGE_KEY,
        serializeBackup(state),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  useEffect(() => {
    if (!initialSetup || importedSetup.current === initialSetup) return;
    importedSetup.current = initialSetup;
    setUndoState(state);
    setState((current) => ({ ...current, current: initialSetup }));
    openMobileSection("position");
    setNotice(
      "Position opened from the market explorer. Check the imported assumptions before using the result.",
    );
    void calculate(initialSetup);
    onImportApplied?.();
  }, [initialSetup, onImportApplied]);

  function loadExample(example: ExampleName) {
    const next = exampleSetup(example, setup.valuationDate);
    setUndoState(state);
    updateSetup(next);
    setNotice(
      "Loaded a synthetic example. Edit every assumption to match your own position.",
    );
    void calculate(next);
  }
  function saveSetup() {
    try {
      const saved = saveNamedSetup(setup, state.saved);
      setState((current) => ({ ...current, saved }));
      // An older load/removal snapshot must not erase this newly saved record.
      setUndoState(null);
      setNotice(`Saved “${setup.name.trim()}” in this browser.`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save this setup.",
      );
    }
  }
  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error("Backup exceeds the 5 MB limit.");
      const incoming = parseBackup(await file.text());
      const saved = mergeSavedSetups(state.saved, incoming.saved);
      setUndoState(state);
      setState({ current: incoming.current, saved });
      openMobileSection("position");
      setNotice(
        `Backup imported. Your saved library now contains ${saved.length} setups.`,
      );
      setError(null);
      void calculate(incoming.current);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to import this backup.",
      );
    }
  }
  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(reviewBrief(setup, currentAnalysis));
      setNotice(
        "Review brief copied. Paste it into your ChatGPT conversation.",
      );
    } catch {
      setError(
        "Clipboard access is unavailable. Use Download brief to save the same review text.",
      );
    }
  }
  const briefFilename = `${setup.symbol.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "position"}-review.txt`;

  return (
    <main
      className="wb-shell"
      id="workbench-content"
      tabIndex={-1}
      data-mobile-section={mobileSection}
    >
      <header className="wb-intro">
        <div>
          <span className="wb-kicker">Your position, in perspective</span>
          <h1>Position workbench</h1>
          <p>
            Map the payoff. Test the dates that matter. Write down what would
            change your mind.
          </p>
        </div>
        <span className="wb-local-badge">
          <span aria-hidden="true">◉</span> Private · stored in this browser
        </span>
      </header>
      <nav className="wb-mobile-sections" aria-label="Workbench sections">
        {(
          [
            ["position", "Position"],
            ["analysis", "Analysis"],
            ["plan", "Plan & saves"],
          ] as const
        ).map(([section, label]) => (
          <button
            key={section}
            type="button"
            aria-current={mobileSection === section ? "page" : undefined}
            onClick={() => openMobileSection(section)}
          >
            {label}
            {section === "analysis" && dirtyResults ? (
              <span
                className="wb-needs-refresh"
                aria-label="needs recalculation"
              />
            ) : null}
          </button>
        ))}
      </nav>
      <div
        className={`wb-data-banner ${setup.isExample ? "example" : "manual"}`}
      >
        <strong>
          {setup.isExample ? "Synthetic example" : "Manual snapshot"}
        </strong>
        <span className="wb-data-banner-detail">
          {setup.isExample
            ? "These prices are invented for exploration. Replace them with your position and current data."
            : `Pricing date: ${setup.valuationDate || "not set"}. Entered or copied prices stay fixed until you update them. The workbench does not fetch or verify live quotes.`}
        </span>
        <span className="wb-data-banner-compact">
          {setup.isExample
            ? "Invented prices for practice."
            : `${setup.valuationDate || "Date not set"} · update prices before each review.`}
        </span>
        {setup.isExample ? (
          <button
            type="button"
            onClick={() => updateSetup({ isExample: false })}
          >
            Use as my position
          </button>
        ) : null}
      </div>
      {storageError ? (
        <div className="wb-message error" role="alert">
          Browser storage is unavailable. Your work remains in this tab; export
          a backup to keep it.
        </div>
      ) : null}
      {notice ? (
        <div className="wb-message" role="status">
          <span>{notice}</span>
          {undoState ? (
            <button
              type="button"
              onClick={() => {
                setState(undoState);
                setUndoState(null);
                setNotice("Previous workspace restored.");
                void calculate(undoState.current);
              }}
            >
              Undo last load / removal
            </button>
          ) : null}
          <button
            className="wb-icon-button"
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="wb-mobile-position-summary">
        <div>
          <strong>{setup.name || "Untitled position"}</strong>
          <span>
            {setup.symbol || "Set underlying"} · {setup.legs.length}{" "}
            {setup.legs.length === 1 ? "leg" : "legs"} ·{" "}
            {setup.valuationDate || "Set date"}
          </span>
        </div>
        <button type="button" onClick={() => openMobileSection("position")}>
          Edit
        </button>
      </div>

      <section
        className="wb-card wb-editor"
        aria-labelledby="wb-position-heading"
      >
        <div className="wb-section-heading">
          <div>
            <span className="wb-kicker">01 · Define the position</span>
            <h2 id="wb-position-heading">What do you hold?</h2>
          </div>
          <div
            className="wb-example-buttons"
            aria-label="Load a synthetic example"
          >
            <span>Try an example</span>
            {(
              [
                ["vertical", "Vertical"],
                ["condor", "Condor"],
                ["covered", "Covered call"],
                ["calendar", "Calendar"],
                ["butterfly_put", "Butterfly + put"],
              ] as const
            ).map(([key, label]) => (
              <button type="button" key={key} onClick={() => loadExample(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="wb-setup-fields">
          <Field
            label="Setup name"
            type="text"
            value={setup.name}
            onChange={(value) => updateSetup({ name: value })}
            className="wb-name-field"
          />
          <Field
            label="Underlying"
            type="text"
            value={setup.symbol}
            maxLength={20}
            onChange={(value) => updateSetup({ symbol: value.toUpperCase() })}
          />
          <Field
            label="Current spot ($)"
            value={setup.spot}
            onChange={(value) => updateSetup({ spot: value })}
            min="0.000001"
          />
          <Field
            label="Valuation date"
            type="date"
            value={setup.valuationDate}
            onChange={(value) => updateSetup({ valuationDate: value })}
          />
        </div>
        <div className="wb-legs">
          {setup.legs.map((leg, index) => (
            <LegEditor
              key={leg.id}
              leg={leg}
              index={index}
              date={setup.valuationDate}
              onChange={(update) => changeLeg(leg.id, update)}
              onRemove={() =>
                updateSetup({
                  legs: setup.legs.filter((item) => item.id !== leg.id),
                })
              }
            />
          ))}
        </div>
        <div className="wb-add-row">
          <div className="wb-button-row">
            <button
              className="wb-button secondary"
              type="button"
              disabled={setup.legs.length >= 30}
              onClick={() =>
                updateSetup({
                  legs: [...setup.legs, newLeg(setup.valuationDate)],
                })
              }
            >
              + Option leg
            </button>
            <button
              className="wb-button secondary"
              type="button"
              disabled={setup.legs.length >= 30}
              onClick={() =>
                updateSetup({
                  legs: [...setup.legs, newLeg(setup.valuationDate, "stock")],
                })
              }
            >
              + Stock / ETF
            </button>
          </div>
          <span className="wb-caption">
            Entry and mark prices are per share or underlying unit. Quantities
            and multipliers are applied automatically.
          </span>
        </div>
        <details className="wb-input-assumptions">
          <summary>Rates, fees & model assumptions</summary>
          <div className="wb-assumption-fields">
            <Field
              label="Risk-free rate (%)"
              value={setup.rate}
              onChange={(value) => updateSetup({ rate: value })}
              min="-10"
              max="100"
            />
            <Field
              label="Dividend yield (%)"
              value={setup.dividendYield}
              onChange={(value) => updateSetup({ dividendYield: value })}
              min="0"
              max="100"
            />
            <Field
              label="Total round-trip fees ($)"
              value={setup.fees}
              onChange={(value) => updateSetup({ fees: value })}
              min="0"
              hint="Entry + eventual exit, all legs"
            />
          </div>
          <label className="wb-checkbox">
            <input
              type="checkbox"
              checked={setup.calibrateIv}
              onChange={(event) =>
                updateSetup({ calibrateIv: event.target.checked })
              }
            />
            <span>
              Calibrate each option’s IV from its current mark
              <small>
                Fit this European model to entered marks. Missing or
                incompatible marks keep entered IV; check the review findings.
              </small>
            </span>
          </label>
          <p className="wb-caption">
            European Black–Scholes approximation with continuous dividend yield
            and constant per-leg volatility. No early assignment, cash-flow
            path, margin or fill simulation. Adjusted deliverables are
            unsupported.
          </p>
        </details>
      </section>

      <section
        className="wb-card wb-scenario-controls"
        aria-labelledby="wb-controls-heading"
      >
        <div className="wb-section-heading">
          <div>
            <span className="wb-kicker">02 · Stress the assumptions</span>
            <h2 id="wb-controls-heading">What changes from here?</h2>
          </div>
          <span className="wb-caption">No probability assumptions</span>
        </div>
        <div className="wb-control-fields">
          <Field
            label="Days forward"
            value={setup.horizonDays}
            onChange={(value) => updateSetup({ horizonDays: value })}
            min="0"
            max="3650"
            step="1"
            hint="Capped at earliest expiration"
          />
          <Field
            label="IV change (points)"
            value={setup.ivShift}
            onChange={(value) => updateSetup({ ivShift: value })}
            min="-500"
            max="500"
            hint="+5 means 25% → 30% IV"
          />
          <Field
            label="Price move range (%)"
            value={setup.moveRange}
            onChange={(value) => updateSetup({ moveRange: value })}
            min="1"
            max="500"
            hint={`−${Math.min(Number(setup.moveRange) || 0, 100)}% to +${setup.moveRange || "0"}% from spot`}
          />
          <Field
            label="Position loss budget ($)"
            value={setup.lossBudget}
            onChange={(value) => updateSetup({ lossBudget: value })}
            min="0.01"
            hint="Optional; for the full setup"
          />
        </div>
        <div className="wb-roadmap-dates">
          <Field
            label="Roadmap dates"
            type="text"
            maxLength={150}
            value={setup.roadmapDates ?? ""}
            onChange={(value) => updateSetup({ roadmapDates: value })}
            hint="Optional: up to 8 dates, YYYY-MM-DD, separated by commas. Blank uses today, +7, +30 and +60 days. Dates stop at the earliest expiry."
          />
        </div>
        <div className="wb-calculate-row">
          <div>
            <strong>
              {busy
                ? "Calculating your position…"
                : dirtyResults
                  ? "Inputs changed — recalculate to see current results"
                  : currentAnalysis
                    ? `Analysis ready · ${currentAnalysis.valuation_date}`
                    : "Ready when you are"}
            </strong>
            <span>
              {requestState.validationError ??
                "Exact single-expiry payoff plus modeled price, date, and volatility scenarios."}
            </span>
          </div>
          <button
            className="wb-button primary"
            type="button"
            disabled={busy}
            onClick={() => void calculate(setup, true)}
          >
            {busy
              ? "Calculating…"
              : currentAnalysis
                ? "Recalculate"
                : "Analyze position"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </section>
      {error ? (
        <div className="wb-message error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="wb-analysis-section">
        {currentAnalysis && !busy ? (
          <Results analysis={currentAnalysis} setup={setup} />
        ) : (
          <div className="wb-results-placeholder" role="status">
            <span aria-hidden="true">⌁</span>
            <h2>
              {busy
                ? "Mapping your position"
                : dirtyResults
                  ? "Results need a refresh"
                  : "Your risk map starts here"}
            </h2>
            <p>
              {busy
                ? "Calculating payoff, scenarios, and the decision review."
                : dirtyResults
                  ? "The inputs have changed. Analyze again to avoid making a decision from stale numbers."
                  : "Enter your legs, actual entry prices, and market assumptions, then analyze the position."}
            </p>
          </div>
        )}
      </div>

      <div className="wb-notebook-grid">
        <section className="wb-card" aria-labelledby="wb-plan-heading">
          <div className="wb-section-heading">
            <div>
              <span className="wb-kicker">03 · Decide before the noise</span>
              <h2 id="wb-plan-heading">Your trade plan</h2>
            </div>
            <span className="wb-pill">Autosaved draft</span>
          </div>
          <div className="wb-mobile-plan-name">
            <Field
              label="Plan setup name"
              type="text"
              value={setup.name}
              onChange={(name) => updateSetup({ name })}
            />
          </div>
          <div className="wb-plan-fields">
            <label className="wb-field">
              <span>Why does this position make sense?</span>
              <textarea
                rows={3}
                maxLength={4000}
                placeholder="The thesis, catalyst, expected move, and why this structure fits…"
                value={setup.plan.thesis}
                onChange={(event) => updatePlan({ thesis: event.target.value })}
              />
            </label>
            <label className="wb-field">
              <span>What would invalidate the thesis?</span>
              <textarea
                rows={3}
                maxLength={4000}
                placeholder="A price level, changed evidence, event outcome, or time limit…"
                value={setup.plan.invalidation}
                onChange={(event) =>
                  updatePlan({ invalidation: event.target.value })
                }
              />
            </label>
          </div>
          <div className="wb-plan-targets">
            <Field
              label="Profit target ($ P/L)"
              value={setup.plan.profitTarget}
              onChange={(value) => updatePlan({ profitTarget: value })}
              min="0"
              hint="Whole-position gain"
            />
            <Field
              label="Loss limit ($)"
              value={setup.plan.lossLimit}
              onChange={(value) => updatePlan({ lossLimit: value })}
              min="0"
              hint="Positive loss amount"
            />
            <Field
              label="Next review"
              type="date"
              value={setup.plan.reviewDate}
              onChange={(value) => updatePlan({ reviewDate: value })}
            />
          </div>
          <label className="wb-field wb-notes-field">
            <span>Review notes / next action</span>
            <textarea
              rows={3}
              maxLength={8000}
              placeholder="What did you learn? What will you check before changing the position?"
              value={setup.plan.notes}
              onChange={(event) => updatePlan({ notes: event.target.value })}
            />
          </label>
          <p className="wb-caption">
            Targets are reminders, not orders or guaranteed exits. Update the
            valuation date and marks when reviewing a saved position.
          </p>
          <div className="wb-button-row">
            <button
              className="wb-button primary"
              type="button"
              onClick={saveSetup}
            >
              Save named setup
            </button>
            <button
              className="wb-button secondary"
              type="button"
              onClick={() => void copyBrief()}
            >
              Copy ChatGPT brief
            </button>
            <button
              className="wb-button quiet"
              type="button"
              onClick={() =>
                download(
                  reviewBrief(setup, currentAnalysis),
                  briefFilename,
                  "text/plain;charset=utf-8",
                )
              }
            >
              Download brief
            </button>
          </div>
        </section>
        <section
          className="wb-card wb-library"
          aria-labelledby="wb-library-heading"
        >
          <div className="wb-section-heading">
            <div>
              <span className="wb-kicker">Return with a clear head</span>
              <h2 id="wb-library-heading">Saved setups</h2>
            </div>
            <span className="wb-pill">{state.saved.length} / 50</span>
          </div>
          <p className="wb-caption">
            Named snapshots include legs, assumptions, and your plan. Saving the
            same name updates it. Browser storage is local to this browser and
            device.
          </p>
          <div className="wb-saved-list">
            {state.saved.length ? (
              state.saved.map((row) => (
                <div className="wb-saved-item" key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setUndoState(state);
                      updateSetup(row.setup);
                      openMobileSection("position");
                      setNotice(
                        `Opened “${row.setup.name}”. Prices are the saved values, not refreshed quotes.`,
                      );
                      void calculate(row.setup);
                    }}
                  >
                    <strong>{row.setup.name}</strong>
                    <span>
                      {row.setup.symbol} · {row.setup.legs.length} legs ·{" "}
                      {row.setup.isExample ? "Example" : "Manual"}
                    </span>
                    <small>
                      Saved {new Date(row.updatedAt).toLocaleDateString()}
                    </small>
                  </button>
                  <button
                    className="wb-icon-button"
                    type="button"
                    aria-label={`Delete saved setup ${row.setup.name}`}
                    onClick={() => {
                      setUndoState(state);
                      setState((current) => ({
                        ...current,
                        saved: current.saved.filter(
                          (item) => item.id !== row.id,
                        ),
                      }));
                      setNotice(`Removed “${row.setup.name}”.`);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="wb-library-empty">
                <span aria-hidden="true">▤</span>
                <p>A thesis is easier to review when you save it.</p>
                <small>Name this setup and save your first position.</small>
              </div>
            )}
          </div>
          <div className="wb-library-actions">
            <button
              className="wb-button secondary"
              type="button"
              onClick={() => {
                download(
                  serializeBackup(state),
                  "option-atlas-backup.json",
                  "application/json",
                );
                setNotice(
                  "Backup exported, including your current draft and all saved setups.",
                );
              }}
            >
              Export backup
            </button>
            <button
              className="wb-button secondary"
              type="button"
              onClick={() => fileInput.current?.click()}
            >
              Import backup
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Import Option Atlas backup"
              onChange={(event) => void importBackup(event)}
            />
          </div>
          <button
            className="wb-new-position"
            type="button"
            onClick={() => {
              setUndoState(state);
              const next = {
                ...exampleSetup(),
                name: "",
                symbol: "",
                legs: [],
                isExample: false,
                plan: blankPlan(),
                lossBudget: "",
              };
              updateSetup(next);
              openMobileSection("position");
              setNotice(
                "Started a blank position. Your saved setups are available below.",
              );
            }}
          >
            Start a blank position
          </button>
        </section>
      </div>
      <div className="wb-mobile-actions">
        <div id="wb-mobile-action-status">
          <strong>
            {mobileSection === "plan"
              ? "Keep your plan"
              : `${setup.symbol || "Your position"} · ${setup.legs.length} legs`}
          </strong>
          <span>
            {error ??
              (mobileSection === "plan"
                ? storageError
                  ? "Only in this tab · export a backup"
                  : "Draft saved in this browser"
                : (requestState.validationError ??
                  (dirtyResults
                    ? "Inputs changed · analyze again"
                    : currentAnalysis
                      ? "Analysis ready"
                      : "Enter your position to begin")))}
          </span>
        </div>
        <button
          type="button"
          className="wb-button primary"
          disabled={busy && mobileSection !== "plan"}
          aria-describedby="wb-mobile-action-status"
          onClick={() => {
            if (mobileSection === "plan") saveSetup();
            else if (mobileSection === "analysis" && currentAnalysis)
              openMobileSection("position");
            else if (currentAnalysis) openMobileSection("analysis");
            else void calculate(setup, true);
          }}
        >
          {mobileSection === "plan"
            ? "Save setup"
            : busy
              ? "Calculating…"
              : currentAnalysis
                ? mobileSection === "analysis"
                  ? "Edit position"
                  : "View analysis"
                : "Analyze position"}
        </button>
      </div>
      <footer className="wb-footer">
        An analysis workspace, not an execution system. Review quote quality,
        assignment exposure, liquidity and your own constraints before acting.
      </footer>
    </main>
  );
}
