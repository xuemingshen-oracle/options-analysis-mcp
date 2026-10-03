import { useEffect, useMemo, useState } from "react";

import { money, signedMoney } from "./research";
import type { ResearchAnalysis, ResearchPoint } from "./research";

type NumericPoint = { x: number; y: number };

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumSignificantDigits: 3,
});

function values(points: ResearchPoint[]): NumericPoint[] {
  return points
    .map((point) => ({
      x: Number(point.underlying_price),
      y: Number(point.profit_loss),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);
}

export function interpolate(points: NumericPoint[], x: number): number | null {
  if (!points.length || x < points[0].x || x > points[points.length - 1].x)
    return null;
  const right = points.findIndex((point) => point.x >= x);
  if (right === 0) return points[0].y;
  const a = points[right - 1];
  const b = points[right];
  if (a.x === b.x) return b.y;
  return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
}

export default function ResearchChart({
  analysis,
}: {
  analysis: ResearchAnalysis;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const expiry = useMemo(() => values(analysis.payoff_points), [analysis]);
  const horizon = useMemo(() => values(analysis.horizon_points), [analysis]);
  const all = [...expiry, ...horizon];
  if (all.length < 2)
    return (
      <p className="wb-muted">
        There are not enough points to plot this position.
      </p>
    );
  const minX = Math.min(...all.map((point) => point.x));
  const maxX = Math.max(...all.map((point) => point.x));
  const low = Math.min(0, ...all.map((point) => point.y));
  const high = Math.max(0, ...all.map((point) => point.y));
  const marginY = Math.max(1, (high - low) * 0.12);
  const minY = low - marginY;
  const maxY = high + marginY;
  const width = compact ? 360 : 880,
    height = compact ? 290 : 350,
    left = compact ? 65 : 78,
    right = compact ? 22 : 26,
    top = 22,
    bottom = 46;
  const x = (value: number) =>
    left +
    ((value - minX) / Math.max(0.000001, maxX - minX)) * (width - left - right);
  const y = (value: number) =>
    top + ((maxY - value) / (maxY - minY)) * (height - top - bottom);
  const line = (points: NumericPoint[]) =>
    points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
  const selectedX = Math.min(
    maxX,
    Math.max(minX, selected ?? Number(analysis.spot)),
  );
  const expiryY = interpolate(expiry, selectedX);
  const horizonY = interpolate(horizon, selectedX);
  const axisMoney = (value: number) =>
    compact && Math.abs(value) >= 1000
      ? compactMoney.format(value)
      : money(value);
  return (
    <div className={`wb-chart ${compact ? "wb-chart-compact" : ""}`}>
      <div className="wb-chart-legend">
        <span>
          <i className="wb-line-key horizon" />
          {analysis.horizon_date} · model
        </span>
        {expiry.length > 0 ? (
          <span>
            <i className="wb-line-key expiry" />
            {analysis.expiration_date ?? "Expiration"} · expiration
          </span>
        ) : (
          <span className="wb-muted">
            Mixed expirations: no single expiry payoff
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Position profit and loss from entry by underlying price. Dashed violet curve is the horizon model; solid green curve is expiration payoff. Values are also available in the scenario table."
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const rect = event.currentTarget.getBoundingClientRect();
          const chartX = ((event.clientX - rect.left) / rect.width) * width;
          setSelected(
            minX + ((chartX - left) / (width - left - right)) * (maxX - minX),
          );
        }}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const value = minY + ((maxY - minY) * index) / 4;
          return (
            <g key={`y-${index}`}>
              <line
                className="wb-chart-grid"
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
              />
              <text
                className="wb-chart-label"
                x={left - 10}
                y={y(value) + 4}
                textAnchor="end"
              >
                {axisMoney(value)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: compact ? 4 : 6 }, (_, index) => {
          const value = minX + ((maxX - minX) * index) / (compact ? 3 : 5);
          return (
            <text
              className="wb-chart-label"
              key={`x-${index}`}
              x={x(value)}
              y={height - 21}
              textAnchor={
                compact && index === 0
                  ? "start"
                  : compact && index === 3
                    ? "end"
                    : "middle"
              }
            >
              {axisMoney(value)}
            </text>
          );
        })}
        <line
          className="wb-chart-zero"
          x1={left}
          x2={width - right}
          y1={y(0)}
          y2={y(0)}
        />
        <line
          className="wb-chart-spot"
          x1={x(Number(analysis.spot))}
          x2={x(Number(analysis.spot))}
          y1={top}
          y2={height - bottom}
        />
        {expiry.length > 0 ? (
          <polyline className="wb-chart-expiry" points={line(expiry)} />
        ) : null}
        <polyline className="wb-chart-horizon" points={line(horizon)} />
        {analysis.break_even_prices
          .filter((value) => Number(value) >= minX && Number(value) <= maxX)
          .map((value) => (
            <circle
              className="wb-chart-break-even"
              key={String(value)}
              cx={x(Number(value))}
              cy={y(0)}
              r="4.5"
            >
              <title>Break-even {money(value, 2)}</title>
            </circle>
          ))}
        <line
          className="wb-chart-cursor"
          x1={x(selectedX)}
          x2={x(selectedX)}
          y1={top}
          y2={height - bottom}
        />
        {horizonY !== null ? (
          <circle
            className="wb-chart-horizon-dot"
            cx={x(selectedX)}
            cy={y(horizonY)}
            r="5"
          />
        ) : null}
        {expiryY !== null ? (
          <circle
            className="wb-chart-expiry-dot"
            cx={x(selectedX)}
            cy={y(expiryY)}
            r="4"
          />
        ) : null}
      </svg>
      <div className="wb-chart-inspector">
        <label>
          Inspect underlying price
          <input
            aria-label="Inspect underlying price on payoff chart"
            type="range"
            min={minX}
            max={maxX}
            step={Math.max(0.01, (maxX - minX) / 1000)}
            value={selectedX}
            onChange={(event) => setSelected(Number(event.target.value))}
          />
        </label>
        <div>
          <span>Underlying</span>
          <strong>{money(selectedX, 2)}</strong>
        </div>
        <div>
          <span>Horizon P/L</span>
          <strong
            className={Number(horizonY) < 0 ? "wb-negative" : "wb-positive"}
          >
            {horizonY === null ? "—" : signedMoney(horizonY)}
          </strong>
        </div>
        {expiry.length > 0 ? (
          <div>
            <span>Expiration P/L</span>
            <strong
              className={Number(expiryY) < 0 ? "wb-negative" : "wb-positive"}
            >
              {expiryY === null ? "—" : signedMoney(expiryY)}
            </strong>
          </div>
        ) : null}
      </div>
      <p className="wb-caption">
        P/L includes entry cost and total fees. Dotted vertical line: current
        spot {money(analysis.spot, 2)}. Circles on zero: expiration break-evens.
        Move across the chart or use the slider.
      </p>
    </div>
  );
}
