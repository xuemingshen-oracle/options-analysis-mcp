import { decimal } from "./chain";
import { payoffGeometry } from "./payoff";
import type { DecimalValue, PositionAnalysis } from "./types";
import WarningDisclosure from "./WarningDisclosure";

interface Props {
  analysis: PositionAnalysis | null;
  loading: boolean;
  error: string | null;
}

function money(value: DecimalValue | null | undefined): string {
  const parsed = decimal(value);
  return parsed === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(parsed);
}

function signed(value: DecimalValue | null | undefined, digits = 1): string {
  const parsed = decimal(value);
  return parsed === null ? "—" : parsed.toFixed(digits);
}

function riskValue(
  value: DecimalValue | null,
  bounded: boolean | null,
  unlimitedLabel: string,
): string {
  if (bounded === false) return unlimitedLabel;
  return money(value);
}

function premiumLabel(value: DecimalValue | null): string {
  const parsed = decimal(value);
  if (parsed === null) return "—";
  return parsed >= 0
    ? `${money(parsed)} debit`
    : `${money(Math.abs(parsed))} credit`;
}

function scenarioMove(change: DecimalValue, spot: DecimalValue | null): string {
  const amount = decimal(change);
  const underlying = decimal(spot);
  if (amount === null) return "—";
  if (underlying === null || underlying <= 0) return money(amount);
  const percent = (amount / underlying) * 100;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export default function AnalysisPanel({ analysis, loading, error }: Props) {
  if (error)
    return (
      <div className="analysis-error" role="alert">
        {error}
      </div>
    );
  if (loading) {
    return (
      <div className="analysis-empty" role="status">
        Calculating combined position…
      </div>
    );
  }
  if (!analysis) {
    return (
      <div className="analysis-empty">
        Choose a template or add contracts to calculate combined risk.
      </div>
    );
  }

  const chart = payoffGeometry(analysis.payoff_points);
  const greeks = analysis.aggregate_greeks;
  return (
    <div className="combined-analysis">
      <div className="risk-grid">
        <div>
          <span>Entry</span>
          <strong>{premiumLabel(analysis.net_cost_basis)}</strong>
        </div>
        <div>
          <span>Current P/L from entry</span>
          <strong>
            {analysis.net_market_value !== null &&
            analysis.net_cost_basis !== null
              ? money(
                  Number(analysis.net_market_value) -
                    Number(analysis.net_cost_basis),
                )
              : "—"}
          </strong>
        </div>
        <div>
          <span>Signed current value</span>
          <strong>{money(analysis.net_market_value)}</strong>
        </div>
        <div>
          <span>Max profit</span>
          <strong>
            {riskValue(
              analysis.max_profit,
              analysis.max_profit_bounded,
              "Unlimited",
            )}
          </strong>
        </div>
        <div>
          <span>Max loss</span>
          <strong>
            {riskValue(
              analysis.max_loss,
              analysis.max_loss_bounded,
              "Unlimited",
            )}
          </strong>
        </div>
        <div>
          <span>Break-even</span>
          <strong>
            {analysis.break_even_prices
              .map((value) => money(value))
              .join(", ") || "—"}
          </strong>
        </div>
      </div>

      <div className="greek-grid">
        {(["delta", "gamma", "theta", "vega"] as const).map((name) => {
          const exposure = greeks[name];
          const unavailable =
            !exposure.complete &&
            analysis.positions.every((position) =>
              exposure.missing_symbols.includes(position.instrument.symbol),
            );
          return (
            <div
              className={exposure.complete ? "" : "incomplete"}
              key={name}
              title={
                exposure.complete
                  ? undefined
                  : `Missing ${name}: ${exposure.missing_symbols.join(", ")}`
              }
            >
              <span>{name}</span>
              <strong>{unavailable ? "—" : signed(exposure.value, 2)}</strong>
              {!exposure.complete ? (
                <small>{unavailable ? "Unavailable" : "Partial"}</small>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="payoff-card">
        <div className="draft-heading">
          <span className="eyebrow">Expiration payoff</span>
          <span>
            {analysis.expiration_date ??
              (analysis.positions.some((position) => position.instrument.option)
                ? "Multiple dates"
                : "Stock only")}
          </span>
        </div>
        {chart ? (
          <>
            <svg
              aria-label="Expiration profit and loss chart"
              className="payoff-chart"
              role="img"
              viewBox="0 0 440 180"
            >
              <line
                className="zero-line"
                x1="18"
                x2="422"
                y1={chart.zeroY}
                y2={chart.zeroY}
              />
              <polyline className="payoff-line" points={chart.points} />
            </svg>
            <div className="chart-axis">
              <span>{money(chart.minX)}</span>
              <span>
                P/L {money(chart.minY)} to {money(chart.maxY)}
              </span>
              <span>{money(chart.maxX)}</span>
            </div>
          </>
        ) : (
          <p className="draft-empty">
            Payoff requires one underlying, compatible standard contracts, and
            complete entry prices. Review analysis warnings for missing data.
          </p>
        )}
      </div>

      <div className="scenario-card">
        <span className="eyebrow">Delta-gamma scenarios</span>
        <p className="draft-empty">
          Estimated change from today, with time and volatility unchanged. Large
          moves can be inaccurate.
        </p>
        <div className="scenario-row scenario-heading">
          <span>Move</span>
          <span>Underlying</span>
          <span>P/L change</span>
        </div>
        {analysis.scenarios.map((scenario) => (
          <div
            className="scenario-row"
            key={String(scenario.underlying_change)}
          >
            <span>
              {scenarioMove(
                scenario.underlying_change,
                analysis.underlying_price,
              )}
            </span>
            <span>{money(scenario.underlying_price)}</span>
            <strong>{money(scenario.estimated_profit_loss)}</strong>
          </div>
        ))}
        {!analysis.scenarios.length ? (
          <p className="draft-empty">
            Price scenarios require one underlying and a current underlying
            price.
          </p>
        ) : null}
      </div>

      <WarningDisclosure
        title="Analysis warnings"
        warnings={analysis.warnings}
      />

      {analysis.assumptions.length ? (
        <details className="analysis-notes">
          <summary>
            Analysis assumptions ({analysis.assumptions.length})
          </summary>
          {analysis.assumptions.map((assumption) => (
            <p key={assumption}>{assumption}</p>
          ))}
        </details>
      ) : null}
    </div>
  );
}
