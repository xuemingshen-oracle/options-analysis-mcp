# Position workbench

Option Atlas is a personal, local options research application. The position
workbench is the primary workflow; the market explorer remains available for
provider quotes, option chains, and strategy construction. Core work lives on
`eshen/main`. Experimental features are kept on separate `eshen/*` branches.

## Product decisions

The motivating workflow is an existing position with multiple calls, puts,
possibly shares, different expirations, and an entry basis that may differ from
a brokerage display. The questions are: What do I own? Where does its risk come
from? What changes if price, time, or volatility changes? What would make me
revisit the position?

The core application therefore emphasizes:

1. Explicit position inputs, including each actual entry price and optional
   current mark. Prices are per share/unit, quantities are signed contracts or
   shares, and multipliers are visible.
2. Auditable accounting. A credit appears once in entry cash flow. Current
   P/L from entry and additional change from today's value are separate.
3. Exact terminal payoff for compatible standard contracts, alongside modeled
   pre-expiration values. A calendar does not have one common exact expiry
   payoff and is never presented as if it did.
4. Price/time/volatility stress testing and a per-leg value breakdown.
5. A written thesis, invalidation condition, target, loss limit, and review date.
6. Saved setups and a portable analysis brief for a subsequent conversation.

The workbench does not need a live market-data connection. Example positions
use the synthetic symbol XYZ and are visibly labeled. Transferring a market
explorer position preserves its entry basis; unknown basis must be filled in
before transfer. Provider marks and default model inputs still need review.

## First review of a real position

1. Start a blank position, or edit an example and choose **Use as my position**.
   Enter the underlying, pricing date and spot, followed by every stock/option
   leg. Use positive counts with Long/Short direction and actual entry basis;
   current marks belong in their separate fields. Check multipliers.
2. Run **Analyze position**. Reconcile signed entry/current values in the leg
   breakdown with your records before interpreting the graph. A negative
   short-option current value is a liability, not a second realized loss.
3. Enter the dates you actually want to review in **Roadmap dates**. Inspect
   both P/L from entry and additional change from today. In **Across dates**,
   switch to delta/gamma to inspect how exposure changes. Change IV separately
   to see which conclusions depend on the volatility assumption.
4. Write the thesis and its invalidation condition. Set a review date and a
   loss budget for the whole position. Save a named setup and export a backup.
5. When returning, update the valuation date, spot and marks together. Saved
   setups are snapshots, not automatically refreshed holdings. The exported
   ChatGPT brief includes assumptions and accounting context for a follow-up
   review; sharing it remains an explicit action outside this application.

## Accounting contract

For each leg, let `q` be signed quantity, `m` the multiplier (1 for stock),
`e` entry price, `c` current price, and `v(S,t)` future per-unit value:

```
signed entry value = sum(q * m * e)       # positive debit, negative credit
current value     = sum(q * m * c)       # negative for short liabilities
P/L from entry    = future value - signed entry value - modeled fees
change from today = future value - current value
```

Manual fixed fees are a total round-trip allowance. The API also supports a
per-option-contract fee on both entry and exit. Both fee fields are additive;
fees are reserved once in reported P/L, including current P/L. They are an
estimate, not a reconstruction of broker charges. Change from today compares
values with the same fee allowance, so it does not charge those fees again.

For a synthetic long 100 call entered at 4.20 and short 110 call entered at
1.30, each with multiplier 100, net entry is a $290 debit. With no fees,
expiration P/L is -$290 below 100, $710 at or above 110, and zero at 102.90.
A $1,000 loss budget fits three copies of the **entire input position**.
Scaling the existing position is not the same as adding that many contracts
to every leg or calculating buying power.

## Model scope

Pre-expiration values use Black–Scholes–Merton with continuous dividend yield,
calendar-day time, and per-leg volatility. Theta is dollars per calendar day;
vega and rho are dollars per one percentage-point change. Exact expiration
payoff uses Decimal arithmetic; modeled prices use double-precision floating
point and are returned as decimal values.

Scenario dates stop at the earliest option expiration. This avoids inventing
what the investor does with assigned shares or expired legs afterward. Later
options retain modeled time value at that horizon. Global max profit/loss and
break-even values are omitted for multiple-expiration positions. A plotted
range is not a global risk bound. The date roadmap can also show delta and
gamma to reveal where the position changes direction or becomes short gamma;
these sensitivities are not profit/loss. Expiry/zero-volatility boundary Greeks
are flagged and not displayed as continuous hedging estimates.

Optional IV calibration fits each entered option mark using this same European
model, with a bounded 0–500% volatility search. Incompatible marks retain the
entered IV and produce a visible finding. The leg breakdown shows the effective
IV and whether it was fitted or entered. Fitting today’s price does not validate
future price dynamics.

European values do not model American early exercise, discrete dividends,
assignment timing, pin risk, bid/ask execution, margin calls, tax treatment,
or path-dependent outcomes. A bounded expiration payoff does not imply bounded
interim funding needs. Stock dividends and financing cash flows are not added
to position P/L. Model output is conditional on entered assumptions, not a
forecast or a claim about probability of profit.

Decision findings are transparent rules about the supplied position, such as
unlimited loss, loss-budget use, short-option assignment, approaching expiry,
or mark/model disagreement. A target or loss limit is a review trigger, not
an order or a guarantee that a fill is possible.

References checked during implementation:

- [OIC: Black–Scholes Formula](https://www.optionseducation.org/advancedconcepts/black-scholes-formula)
  explains model inputs and the early-exercise limitation of European pricing.
- [OIC: Understanding Options Greeks](https://www.optionseducation.org/advancedconcepts/understanding-options-greeks)
  describes sensitivities as theoretical estimates.
- [OIC: Options Assignment](https://www.optionseducation.org/referencelibrary/faq/options-assignment)
  explains assignment uncertainty and short-option obligations.

## Data and persistence

The workbench's current draft, named setups, and plans are stored in this
browser's local storage. Export a JSON backup to move them between browsers,
ports, or machines. Clearing browser storage removes that local library.
Import validates the format, size, leg types, identifiers, and fields; it
does not load code. Analysis briefs are generated locally and downloaded or
copied only when requested in the interface. The app does not send them to an
AI service.

The market explorer's watchlist and strategy drafts continue to use the
existing SQLite store. Market-data adapters and provider credentials remain
separate from manual position analysis. All application endpoints bind to the
local machine by default; no trade execution is added.

## Development and checks

`examples/manual-position.json` is a fixed-date, synthetic butterfly plus short
put. It demonstrates why a $300 net debit can coexist with $7,300 terminal
downside risk. Submit it to the HTTP API with the local server running:

```sh
curl http://127.0.0.1:8000/api/v1/research/analyze \
  -H 'Content-Type: application/json' --data-binary @examples/manual-position.json
```

For MCP, pass the same object as `request` to `options_analyze_manual_position`.
It is historical synthetic input, not a quote or a proposed trade.

```sh
uv sync --all-groups
make check
cd ui
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser checks start an isolated local server and use a temporary database.
The packaged static bundle is rebuilt with `npm run build`. To run the normal
application, use `uv run options-analysis-web` and open `http://127.0.0.1:8000`.

## Deliberately separate explorations

Two working experiments are committed separately and are not included in the
core interface. Each accepts a synthetic JSON example and writes a standalone
HTML report plus JSON results. Use a separate worktree to evaluate either one.

| Branch | What it explores | Guide in that branch |
| --- | --- | --- |
| `eshen/adjustment-lab` | Hold versus close versus explicit adjustments, with signed trade cash, closing fills, separate fees, future value, total P/L and change from today on a common date. | `ADJUSTMENT_LAB.md` |
| `eshen/distribution-lab` | How declared terminal drift and volatility assumptions change conditional probability of profit and expected P/L for one shared expiry. No ranking or recommendation. | `docs/DISTRIBUTION_LAB.md` |

From the adjustment branch:

```sh
uv run python -m options_analysis.experiments.adjustment_cli \
  examples/adjustment-comparison.json --output-dir /tmp/adjustment-report
```

From the distribution branch:

```sh
uv run options-analysis-distribution-lab examples/distribution-lab.json \
  --output-dir /tmp/distribution-report
```

The adjustment experiment makes closing/replacement fills explicit before
comparing outcomes. The distribution experiment integrates a stated lognormal
terminal distribution, including its infinite tail; its probabilities are
conditional assumptions, not measured trading odds. Neither models tax,
assignment paths, or broker buying power. Historical backtesting remains
deferred because it also needs historical option data and a credible execution
model.
