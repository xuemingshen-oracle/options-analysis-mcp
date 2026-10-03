# ESHEN implementation guide — Option Atlas 0.9.0

This document records the additions made to turn the options-analysis prototype
into a personal position research application. It covers the core work on
`eshen/main`, the two separate experiments, accounting conventions, implementation
locations, and verification. The starting checkpoint was `7ec82d3` on the
repository's original `main` branch.

## Quick start

From the repository root, start the complete application with the existing
virtual environment:

```sh
.venv/bin/options-analysis-web
```

Then visit **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.
Keep the terminal running; press **Ctrl+C** to stop the server. The command binds
to the local machine and serves both the HTTP API and the bundled production UI.
You do not need to start a separate frontend server or supply brokerage
credentials to use the manual workbench.

For a fresh checkout, select the core branch and create the environment first:

```sh
git switch eshen/main
uv sync --all-groups
.venv/bin/options-analysis-web
```

Python 3.12 or newer is required. In the original development workspace, an
ignored local installation of `uv` is also available as `.uv-bootstrap/bin/uv`;
it can replace `uv` in the setup command. That bootstrap and `.venv` are local
tools, not committed files. The production JavaScript and CSS are committed,
so Node/npm are needed only to develop or rebuild the UI.

The initial XYZ position is a clearly labeled synthetic example. The default
market-data provider is also synthetic. Saved manual marks do not refresh
automatically when the server starts or the page reloads.

For an iPhone on the same trusted Wi-Fi, use
`.venv/bin/options-analysis-web --host 0.0.0.0`, open
`http://<your-Mac-LAN-IP>:8000` in Safari, and choose **Share → Add to Home
Screen**. Keep the Mac awake and the server running. See [MOBILE.md](MOBILE.md)
for the complete setup, storage guidance and installation steps.

## Design and scope

The shared ChatGPT conversation was successfully reviewed. It motivated the
focus on combinations of stock, calls and puts; butterflies partly funded by
short puts; calendars; corrected entry basis; monthly review dates; changing
delta/gamma; and comparing adjustments without double-counting credits.
Conversation exports and private positions were not committed. Examples use
fictional XYZ or DEMO positions.

The main design decisions were:

- Make manual analysis useful before a live data provider is configured.
- Keep entry basis, current value, model value, and future scenarios distinct.
- Pair exact compatible expiration payoff with explicitly modeled values
  before expiration.
- Make assumptions and the reasons for review findings inspectable.
- Support a recurring personal review through plans, saved setups and exports.
- Keep adjustment comparisons and probability assumptions on separate branches
  while their value and complexity are evaluated.

The existing provider adapters, market explorer, price-history indicators,
watchlists and strategy catalog remain part of the application. Their original
creation predates this work; the changes below describe the new workbench,
integration, correctness fixes and hardening.

## Core application: `eshen/main`

### Position editor and examples

The position workbench is now the landing workspace. It accepts a combination
of long or short stock/ETF shares, calls and puts for one underlying:

- Underlying symbol, spot price and explicit valuation date.
- Direction, quantity and actual per-unit entry price for every leg.
- Optional per-unit current marks, independently of entry prices.
- Option strike, expiration, per-leg IV and contract multiplier.
- Risk-free rate, continuous dividend yield and total round-trip fee allowance.
- Forward horizon, IV change, price-move range, roadmap dates and loss budget.

The UI supports up to 30 legs; the underlying HTTP/MCP request supports up to
40. Option quantities must be whole contracts, while stock may be fractional.
Stock uses a multiplier of one. Option premiums are per underlying unit and
are multiplied by signed quantity and the entered multiplier.

Five editable examples are included: bull call spread, iron condor, covered
call, call calendar, and butterfly plus short put. The butterfly/put example
demonstrates a $300 debit with $7,300 maximum terminal loss and $1,700 maximum
terminal profit, showing why net premium alone is not the risk measure.

Users can start blank or convert an example into their own position. Edits
invalidate displayed results until recalculation, and incomplete inputs remain
editable and persistable without being treated as a valid analysis.

### Accounting and exact terminal risk

The new manual engine keeps these quantities separate:

```text
Signed entry value = sum(signed quantity × multiplier × entry price)
Current value      = sum(signed quantity × multiplier × current price)
P/L from entry     = future position value − signed entry value − modeled fees
Change from today  = future position value − current position value
```

A positive signed entry value is a debit; a negative value is an opening
credit. A short position's negative current value is a liability. Opening
credits are counted once, and current marks never silently replace a missing
entry basis.

Current P/L also reserves the modeled fee allowance. Fixed fees represent a
total round-trip allowance. The API additionally supports a per-option-contract
fee charged for entry and exit; that allowance is additive to fixed fees.
Change from today compares values with the same fee allowance, so it does not
charge those fees a second time. Per-leg P/L excludes position-level fees.

For compatible single-expiration standard positions, the engine calculates
piecewise terminal payoff, break-even prices, bounded maximum profit/loss,
unlimited-tail flags, and reward/risk when defined. Strike knots and right-tail
behavior determine the bounds; the finite plotted range is not substituted for
a global maximum loss. Stock-only positions receive their corresponding
payoff treatment without inventing an option expiration.

Loss-budget sizing reports how many complete copies of the entered position
fit a finite maximum-loss budget, plus budget use and whether the existing
position fits. It does not calculate broker buying power. For example, a
$1,000 budget fits three complete $290-risk spreads.

### Pricing, volatility and Greeks

A provider-independent Black–Scholes–Merton calculator supplies European
option values and delta, gamma, theta, vega and rho. It uses actual calendar
days divided by 365 and continuous dividend yield. Theta is per calendar day;
vega and rho are per one percentage-point change. The UI shows current modeled
delta/gamma/theta/vega, while the analysis response also includes rho.

Users may opt into fitting each supplied option mark to a model IV using a
bounded 0–500% search. A failed or incompatible fit produces a visible finding
and retains the entered IV. Responses preserve both the original and effective
IV, and the leg breakdown labels fitted versus entered volatility. Scenario IV
changes are absolute percentage-point shifts: entering +5 changes 25% to 30%.
Invalid shifted IV is rejected rather than silently clamped.

The leg breakdown exposes signed entry/current/model values, P/L, per-unit
model price, intrinsic value, time value and effective IV. This makes it
possible to inspect which short legs still carry time value and where entered
marks disagree with the model.

### Payoff chart and scenario roadmap

The workbench includes an SVG payoff chart with a modeled horizon curve,
compatible expiration curve, current spot marker, break-even markers, price
axes, pointer inspection and a keyboard-accessible slider. The inspector shows
underlying price and horizon/expiration P/L. Captions distinguish current
modeled Greeks from future-date sensitivities.

Scenario tools include:

- Price stress ranging as far as a 100% fall to zero or a 500% rise in the API.
- A selected forward date and optional IV shift.
- Up to eight explicit comma-separated roadmap dates in the UI.
- Default UI checkpoints at today, +7, +30 and +60 days; the API's default
  `scenario_days` is separately defined as 0, 7 and 30.
- Side-by-side P/L from entry and additional change from today.
- Across-date tables that switch between P/L, change from today, delta and
  gamma, with units and boundary disclosures.

For multiple expirations, scenarios stop at the earliest option expiry; later
options retain modeled time value on that date. Global single-expiry risk
bounds and break-evens are omitted. The model does not invent what happens to
assigned shares or expired legs afterward. Greeks at expiry, zero volatility
or zero-spot boundaries are flagged instead of being presented as smooth
hedging estimates.

### Review findings and personal trade plans

Transparent rules call attention to unlimited loss, loss-budget use,
short-option assignment exposure, approaching expiration, mixed expirations,
model boundaries, IV calibration and mark/model disagreement. These are
explanations of entered data, not an automated selection of trades.

Each setup has a plan with thesis, invalidation condition, profit target,
positive-dollar loss limit, next review date and notes. Plan reminders compare
targets with current position P/L and compare review dates with the actual
local date. Historical manual snapshots show their age, and future pricing
dates are labeled hypothetical. A target or review finding does not place an
order or guarantee an executable exit.

### Persistence, backups and ChatGPT briefs

The current manual draft, plans and up to 50 named setups live in browser local
storage under `option-atlas.workbench.v1`. Saving an existing name updates that
setup. Blank numeric/date fields are retained while editing; malformed draft
recovery can preserve independently valid saved setups.

Versioned JSON export/import provides a portable backup. Imports validate the
format, fields, identifiers, leg types, dates and size, with a 5 MB limit.
Saved entries merge by identifier and modification time. Load/removal actions
offer Undo; saving a new named setup retires older Undo snapshots so they
cannot erase that new record.

The app can copy or download a ChatGPT review brief containing the position,
data provenance, entry basis, assumptions, calculated scenarios, findings,
model limits and written plan. Stale calculations are omitted. Blank entry
prices and spot remain explicitly unknown in the brief instead of appearing
as zero. Brief generation is local; the app does not send the position to an
AI service.

Browser storage is separate from the existing SQLite market-explorer store.
Clearing browser storage removes the manual library. Backups are needed to
move it between browsers, ports or machines. If browser policy blocks storage,
the application still starts and analyzes positions, shows a persistence
notice, and allows export from the active tab.

### Market-explorer integration and UI reliability

The global workspace navigation switches between the workbench and market
explorer while preserving their state. Theme and text-size controls apply
across both workspaces. New workbench styling uses the existing visual theme,
with responsive layouts, labeled fields, focus treatment and scrolling tables.

Market-explorer changes include:

- Explicit current-valuation selection: provider mark, midpoint or liquidation.
- Current position value and current P/L displayed in the analysis panel.
- Transfer into the workbench after actual entry basis is supplied; adjusted
  contracts and unsupported explicit deliverables are rejected for transfer.
- Per-leg marks derived from the selected signed market value, preserving the
  selected valuation mode. Transfer notes include provider and quote timestamps
  and make the 30% fallback for missing provider IV explicit.
- Per-symbol draft retention during the session; named drafts remain in SQLite.
- Blank entry input remains unknown, with quantities no longer capped at 99.
- Safe error handling when unsupported quotes are added to a draft.

Asynchronous hardening prevents delayed results from appearing under changed
manual inputs. Failed requests preserve edits and allow recovery. Saved
explorer restores are canceled after edits or navigation and recompute with
the latest valuation selection. Pending strategy-loading state is cleared
when a restore supersedes it. The explorer quote panel was corrected for
tablet widths, and mobile leg inputs were rearranged to avoid cramped controls.

### Corrections to the original analysis path

The provider-enriched analysis path received separate correctness fixes:

- Absolute underlying-dollar changes in scenarios are no longer formatted as
  percentages; estimated additional P/L is labeled as change from today.
- Missing cost basis stays missing through draft construction and transfer.
- Quote-quality warnings propagate into analysis results.
- Liquidation valuation reports fallback when the needed bid/ask is absent.
- Aggregated Greeks disclose incomplete coverage rather than implying all
  legs contributed.
- Adjusted options or explicit nonstandard deliverables suppress standard
  share-deliverable payoff calculations.
- Payoff sampling extends beyond the highest strike to represent the right
  tail correctly.

### Numeric validation and API/MCP access

Manual requests use validated domain models independent of provider adapters.
Limits include finite numbers, whole option quantities, bounded counts and
prices, bounded IV and dates, at most 21 scenario moves and eight roadmap
offsets, and protection against calendar overflow. Numeric precision is limited
to 32 significant digits and 30 decimal places.

Exact payoff and ledger arithmetic use a 128-digit local Decimal context so a
small uncovered tail is not rounded into apparently bounded risk. Sizing uses
integer-ratio arithmetic. Decimal JSON responses use fixed-point strings,
including zero, to remain compatible with MCP output schemas. Model pricing
and normal-distribution calculations use floating point where documented.

New entry points:

| Interface | Entry point |
| --- | --- |
| HTTP | `POST /api/v1/research/analyze` |
| MCP | `options_analyze_manual_position`, with the analysis input under `request` |
| Browser | Position workbench at `/` |
| API documentation | `/api/docs` on the running local server |

The committed synthetic example can be submitted directly:

```sh
curl http://127.0.0.1:8000/api/v1/research/analyze \
  -H 'Content-Type: application/json' \
  --data-binary @examples/manual-position.json
```

The example has a fixed historical valuation date and is not a market quote.
The existing `options_analyze_positions` tool remains available for provider
enrichment. Both paths return structured analysis/error responses.

## Isolated experiment: `eshen/adjustment-lab`

This branch adds an offline hold/close/adjust comparison tool, intentionally
separate from the main interface. It compares Hold, Close and up to eight
explicit adjustments on a common date and price grid. The example explores
rolling one short call versus a short/long pair in a fictional butterfly.

Inputs include original entry basis and current marks, an explicit closing
fill for every original leg, signed adjustment trades, new contract terms and
IV, and separately identified entry, trade and future-exit fees. Adjustment
quantities describe trades, not the final position. Existing contract IV is
preserved, offsetting contracts net out, and new contracts require explicit IV.

The ledger reconciles:

```text
Trade cash today    = −sum(quantity change × multiplier × fill) − trade fees
Future wealth       = trade cash today + remaining value − future exit fees
Total P/L           = future wealth − original entry value − entry fees
Change from today   = future wealth − current original position value
Advantage over Hold = future wealth − Hold future wealth
```

Original premiums are counted once and basis is not reset after a roll. Close
leaves no position and therefore produces a flat future outcome. The horizon
must be no later than every original or traded option expiry. It rejects
inconsistent dates instead of comparing alternatives on different horizons.

The output is a self-contained HTML report with a measure selector, payoff
curves, scenario tables, cash ledger, remaining positions and model checks,
plus `comparison.json`. HTML/script/template-like input labels are escaped.
Imports are size-bounded, numeric inputs are precision-bounded, and the entire
cash ledger uses the protected Decimal context.

After checking out this branch and installing dependencies:

```sh
.venv/bin/python -m options_analysis.experiments.adjustment_cli \
  examples/adjustment-comparison.json --output-dir /tmp/adjustment-report
```

Open `/tmp/adjustment-report/report.html`. Rerunning overwrites files in that
output directory. Read `ADJUSTMENT_LAB.md` on the branch for the full input
contract. In particular, core round-trip fee fields must be zero because this
experiment supplies its own explicit cash-flow fees.

This is economic cash accounting, not tax-lot realized-gain accounting. There
is no automatic choice of strikes, inferred executable fill, interest on cash,
financing cost, probability ranking or order execution.

## Isolated experiment: `eshen/distribution-lab`

This branch adds an explicit terminal-distribution sensitivity tool. For one
shared option expiry, it compares one to twelve named lognormal assumptions
and reports conditional probability of positive, negative or exactly zero
terminal P/L; expected underlying price and position value; expected
undiscounted P/L; and a probability-mass diagnostic.

Every assumption declares annual price drift, annual volatility, and whether
the measure is subjective or risk-neutral. A risk-neutral label requires
drift equal to the entered rate minus yield. Distribution volatility is
separate from option IV: marks, per-leg IV, calibration and interim scenario
controls are not used to infer trading odds.

The implementation partitions exact terminal payoff at strikes and break-even
roots, then integrates lognormal probabilities and first moments analytically,
including the infinite upper tail. It handles deterministic zero-time/zero-vol
cases and distinguishes flat break-even intervals from profitable regions.
Decimal arithmetic preserves payoff slopes and roots; probabilities and
moments use floating point with stable tail calculations.

After checking out this branch:

```sh
uv sync --all-groups
.venv/bin/options-analysis-distribution-lab examples/distribution-lab.json \
  --output-dir /tmp/distribution-report
```

The output directory must not already exist. Open its `report.html`; `result.json`
contains the validated inputs, assumptions, results and limits. The report uses
no scripts or network resources, escapes entered text, and allows keyboard
scrolling of wide tables. See `docs/DISTRIBUTION_LAB.md` on this branch.

These probabilities are conditional on declared assumptions. They are not
empirically measured success rates, confidence intervals or recommendations.
The report highlights the fragility of a fixed lognormal assumption for
daily-reset leveraged products. No ranking or position-selection engine was
added to the core application.

## Branches, artifacts and commit map

| Branch | Delivered work | Implementation tip before this document |
| --- | --- | --- |
| `eshen/main` | Complete workbench, integration, fixes and packaged UI | `5261847` |
| `eshen/adjustment-lab` | Cash-flow comparison reports and regressions | `9bae9df` |
| `eshen/distribution-lab` | Distribution-assumption reports and regressions | `4e50768` |

The experiments were branched from intermediate core checkpoints. They do not
include the complete later frontend integration and should be evaluated as
their documented CLI/report tools. They remain unmerged. Use separate Git
worktrees if you want to evaluate them while keeping the main app running.

Core implementation commits:

| Commit | Change |
| --- | --- |
| `a639bac` | Position basis, scenario units and valuation disclosures |
| `3dd5894` | Manual analysis, pricing/calibration, scenarios, API/MCP and review |
| `41645a4` | Scenario Greeks and numeric precision hardening |
| `3544be0` | Workbench UI, plans, persistence, explorer integration, tests and docs |
| `3b19a32` | Clear Greek valuation dates and personal review walkthrough |
| `5261847` | Unknown-price handling in exported review briefs |

The adjustment branch adds `9e70636`, carries the core hardening as `8066746`,
and adds fee/fill precision protections in `9bae9df`. The distribution
experiment is committed as `4e50768`.

Local build artifacts are ignored by Git: the Python wheel/source archive in
`dist/`, experiment previews in `dist/experiment-previews/`, browser screenshots
and traces in `ui/test-results/`, and local dependency/browser caches. The
examples, source, tests, documentation and production UI assets are committed;
the reports can be regenerated from the branch commands above.

## Implementation map and development changes

| Location | Responsibility added or changed |
| --- | --- |
| `src/options_analysis/domain/research.py` | Manual request/result schemas, validation and Decimal serialization |
| `src/options_analysis/analytics/pricing.py` | European pricing, Greeks and IV inversion |
| `src/options_analysis/analytics/research.py` | Accounting, terminal risk, model scenarios, timeline, sizing and findings |
| `src/options_analysis/analytics/positions.py`, `services/analysis.py` | Corrections to provider-enriched analytics and warnings |
| `src/options_analysis/web/app.py`, `web/models.py` | Manual HTTP analysis transport |
| `src/options_analysis/mcp/server.py`, `mcp/models.py` | Manual MCP tool and response model |
| `ui/src/PositionWorkbench.tsx`, `workbench.css` | Main position editor, results, roadmap, plan and library |
| `ui/src/ResearchChart.tsx` | Payoff/horizon plot and accessible inspection |
| `ui/src/research.ts` | Request conversion, provider transfer, reminders, formatting and review briefs |
| `ui/src/workbenchState.ts` | Examples, browser persistence, validated backups and named setups |
| `ui/src/App.tsx`, `api.ts`, `AnalysisPanel.tsx`, `strategies.ts`, `types.ts` | Workspace integration, valuation modes, draft handling and original UI fixes |
| `ui/src/main.tsx`, `styles.css` | Storage-safe startup, navigation and shared responsive styling |
| `ui/playwright.config.ts`, `ui/e2e/` | Real-browser workflows, race regressions, layout and accessibility checks |
| `src/options_analysis/web/static/` | Rebuilt production UI shipped by the Python application |
| `src/options_analysis/experiments/` on side branches | Respective experiment implementations |

Version identifiers and lockfiles were updated to 0.9.0 on the core branch.
Playwright and axe were added as frontend development dependencies. The npm
test command scopes Vitest to `src` so it does not collect Playwright tests.
`npm run test:e2e` rebuilds the production UI before starting browser checks;
`make web-e2e` exposes the same workflow. Generated browser reports/traces are
ignored by Git.

The README, changelog, status, backlog and release guide were updated. Release
guidance now uses `eshen/*` branches and keeps pushing, publishing and merging
as explicit actions. The backlog records evaluation of both experiments and
possible later work on review history, American exercise and device sync.

## Mobile and Home Screen follow-up

The mobile follow-up stays on `eshen/main` and uses the existing mint/green
palette, cards and light/dark themes. It adds a phone workflow without changing
the underlying financial models:

- At phone widths, the workbench separates **Position**, **Analysis**, and
  **Plan & saves**. Switching sections preserves the draft. A fixed bottom
  action offers calculation, result review, editing or saving as appropriate.
- Position legs collapse into summaries. Entry controls have larger touch
  targets, at least 16px input text, appropriate numeric keyboards, and native
  date pickers. Synthetic/snapshot labels remain visible in a compact form.
- Analysis has a phone-sized payoff chart with fewer, compact axis labels and
  a touch inspection slider that retains full dollar values. Horizon scenarios
  become readable cards; wider date
  roadmaps retain their own scroll area and a pinned first column.
- The shell uses a compact header and bottom navigation between Workbench and
  Market. Navigation restores each workspace's scroll position. Keyboard
  detection hides bottom controls while editing with the software keyboard.
  Safe-area spacing accommodates the Home Screen view and home indicator.
- The market explorer gets larger controls, a scrollable watchlist, compact
  filter layout, and an explicit swipe hint on wide option chains.
- An accessible settings dialog provides appearance, text size, Safari Home
  Screen instructions, and browser-storage guidance. Browser offline events
  show a connection notice. Theme-color metadata follows the selected theme.
- The app manifest declares a standalone launch view and stable identity.
  Apple metadata and 180/192/512px PNG icons use the existing Option Atlas
  artwork. No service worker or offline calculation/cache was added: analysis
  and market data still require the running Python server.
- The server accepts optional `--host` and validated `--port` arguments. The
  default stays `127.0.0.1:8000`; LAN access is an explicit startup choice.
- A new [MOBILE.md](MOBILE.md) guide explains same-network access, installation,
  reachability, local storage and backups. Phone/browser/address libraries are
  separate; the Home Screen app may have a separate storage context too.

Implementation lives in `PositionWorkbench.tsx`, `ResearchChart.tsx`,
`workbench.css`, `App.tsx`, `MobileAppHelp.tsx`, `styles.css`, the HTML/manifest
and public icons, plus `web/server.py`. Updated production assets are bundled
with the Python application. `test_web_server.py` covers CLI defaults and
validation; `ui/e2e/mobile.spec.ts` exercises iPhone/WebKit and
Android/Chromium workflows. See [WORKBENCH_QA.md](WORKBENCH_QA.md) for the mobile
verification checkpoint and real-device limits.

## Verification delivered

The original workbench checkpoint was checked on macOS with Python 3.12 and
Chromium. The later mobile checkpoint, including WebKit, is recorded in
[WORKBENCH_QA.md](WORKBENCH_QA.md):

| Check | Recorded result |
| --- | --- |
| Python unit/integration/contract suite | 209 passed |
| TypeScript unit suite | 72 passed across 10 files |
| Chromium browser suite | 15 passed |
| Ruff formatting/lint and strict mypy | Clean; 66 typed source files |
| React type check/build and Python wheel/source build | Passed |
| Installed wheel HTTP and actual MCP stdio smoke checks | Passed |
| Adjustment experiment | 130 relevant tests passed |
| Distribution experiment | 36 new tests; 245 total branch tests passed |

Tests cover independent price/Greek identities, IV round trips, known option
strategy payoffs, mixed expirations, fee/basis accounting, unsupported terms,
extreme inputs, tiny uncovered tails, transport schemas and browser persistence.
Additional independent checks exercised 200 generated terminal payoffs and
1,000 pricing/IV round trips.

Browser regressions cover stale and failed requests, storage denial,
load/save/Undo safety, imports/exports, provider transfer and delayed explorer
restores. Both workspaces were checked at 1440, 768, 390 and 320 pixels. Desktop
and phone screenshots, dark mode and 130% text were visually inspected. The
workbench passed the automated axe WCAG 2 A/AA and 2.1 A/AA rules checked by the
suite. This is not a complete screen-reader or cross-browser certification.

The installed wheel served its homepage and all referenced assets; all five
core console entry points resolved. HTTP and MCP examples returned verified
risk values. The final production bundle and distributions were rebuilt after
the last text/export fixes; the export regression was included in the passing
72-test TypeScript suite.

To reproduce the full checks:

```sh
uv sync --all-groups
make web-sync
make release-check
cd ui
npx playwright install chromium webkit
npm run test:e2e
```

Browser tests force the synthetic provider and use a temporary SQLite database.
The implementation environment used `PLAYWRIGHT_BROWSERS_PATH` for a temporary
browser installation; it is not required with the default Playwright cache.
See [WORKBENCH_QA.md](WORKBENCH_QA.md) for detailed evidence and environment notes.

## Limits and next evaluation steps

The core models European options with standard share deliverables. It does not
simulate American early exercise, assignment paths, discrete dividends, pin
risk, margin calls, tax lots, executable fills, slippage, borrow/financing cash
flows or realized trading history. A bounded terminal payoff does not imply
bounded interim funding needs. Live Schwab OAuth/data was not exercised, and
no order capability was added.

The manual library is local to a browser origin, and copied provider marks are
snapshots. Use backups and update the valuation date, spot and marks together
when returning to a position. Review-history tracking, authenticated sync,
American pricing and historical backtesting remain future work.

Start with the manual workbench and a reconciled real position. Evaluate the
adjustment report for its fill/fee workflow and the distribution report for
whether making assumptions explicit improves decisions. Neither experiment
needs to be merged to use the core application.

Further reading: [WORKBENCH.md](WORKBENCH.md), [WORKBENCH_QA.md](WORKBENCH_QA.md),
[STATUS.md](../STATUS.md), [TODO.md](../TODO.md), and [CHANGELOG.md](../CHANGELOG.md).
