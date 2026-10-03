# Option Atlas — personal options research

A local application for understanding options positions, exploring what changes
with price, time and volatility, and keeping a clear trading plan. It runs with
no brokerage credentials. Core development lives on `eshen/main`.

## Start here

```sh
uv sync --all-groups
uv run options-analysis-web
```

Open **http://127.0.0.1:8000**. The production UI is included in the repository.
The initial XYZ position is a labeled synthetic example, not a live quote.

**On your iPhone:** the interface has dedicated mobile Position, Analysis and
Plan views and can be added to Safari's Home Screen. To use a phone on the same
trusted Wi-Fi as your Mac, start with `.venv/bin/options-analysis-web --host 0.0.0.0`
and open `http://<your-Mac-LAN-IP>:8000` on the phone. The Mac must stay awake with
the server running. See [mobile setup and Home Screen installation](docs/MOBILE.md)
for steps, storage/backup behavior and network limits.

**Position workbench** is the main workflow:

- Enter any combination of stock, calls and puts with actual entry prices,
  current marks, dates, volatility and contract multipliers.
- See exact single-expiry payoff, break-evens, maximum loss/profit and a loss
  budget. Inspect a chart with spot/break-even markers and an accessible slider.
- Stress underlying price, time and IV. Compare **total P/L from entry** with
  **additional change from today**, including an across-date roadmap and
  delta/gamma exposures.
- Optionally infer per-leg IV from current marks under the pricing model.
  See each leg's signed cost, value, P/L, intrinsic and time value.
- Record thesis, invalidation, exit targets and a review date. Save named setups,
  back up the local library, or export a structured brief for ChatGPT review.

**Market explorer** provides provider quotes, price history, a filtered option
chain, fifteen strategy templates and SQLite-backed drafts. Transfer a position
into the workbench for deeper research. The default provider uses deterministic
fixtures; Schwab requires local authorization.

Manual workbench drafts/plans live in browser storage; use **Export backup** to
keep a portable copy. Market-explorer drafts/watchlists live in SQLite. All
analysis is local; copied/downloaded briefs are not sent to an AI service.

See [the workbench guide](docs/WORKBENCH.md) for accounting conventions, model
scope and verification. Pre-expiration values are European-model estimates;
they do not simulate early assignment, margin, tax, or executable fills.
Multiple-expiration scenarios stop at the first expiry and omit misleading
single-expiry risk bounds. Rule-based findings explain inputs and assumptions;
they are not predictions or automated trading instructions.

The provider-neutral Python services are available through HTTP and MCP.
Manual analysis uses `POST /api/v1/research/analyze` and
`options_analyze_manual_position`; provider-enriched analysis remains available.
Domain models and calculators are independent of provider adapters and the UI.

Repository: https://github.com/xuemingshen-oracle/options-analysis-mcp

- [DESIGN.md](DESIGN.md) — original architecture and provider boundaries.
- [STATUS.md](STATUS.md) — current checkpoint and validation.
- [TODO.md](TODO.md) — remaining work and experimental branches.

## What works

- `options_server_info` returns safe runtime and read-only status.
- `options_list_providers` returns enabled providers and capabilities.
- `options_provider_auth_status` reports safe provider authorization state
  without exposing credentials or token values.
- `options_get_underlying_quote` returns a normalized quote with provenance and
  quality warnings.
- `options_get_option_expirations` lists available expiration dates and DTE.
- `options_get_option_chain` returns at most 100 locally re-filtered contracts;
  its default is 40 contracts and a 45-day Schwab request window.
- `options_get_option_quotes` retrieves 1–100 explicitly selected contracts.
- `options_get_price_history` retrieves underlying bars, not historical option
  chains, and can calculate optional registered technical-indicator series.
- `options_list_technical_indicators` describes available indicators and their
  parameter syntax without coupling an MCP client to built-in implementations.
- `options_analyze_manual_position` analyzes explicitly entered stock/options,
  including modeled time/IV scenarios, optional mark-calibrated IV and review findings.
- `options_analyze_positions` analyzes 1–100 signed equity, ETF, or option legs.
  Positive quantity is long and negative quantity is short.
- The fake provider supplies deterministic quotes, expirations, chains, selected
  option quotes, and underlying history to offline services and contract tests.
- The replay provider loads a strict, size-bounded local snapshot bundle and
  preserves original source provenance while routing it as `replay`.
- The MCP server runs locally over stdio.
- The production browser workspace and HTTP API run together on
  `127.0.0.1:8000`; OpenAPI remains available at `/api/docs`.
- A bounded provider-neutral price-history endpoint powers an underlying chart
  with 1-minute, 5-minute, daily, weekly, and monthly interval tabs, plus
  independently selectable SMA 10, SMA 20, and SMA 50 price overlays.
- A discoverable technical-indicator registry operates after provider
  normalization; the HTTP catalog is available at
  `/api/v1/technical-indicators`.
- Vite runs separately on `127.0.0.1:5173` only for frontend development and
  proxies `/api` to the local API.
- Watchlist add/remove changes persist in a private local SQLite database.
- The option chain supports expiration/side/strike, near-money,
  open-interest, and maximum bid/ask-spread filters.
- Calls and puts show delta, IV, bid, ask, spread, open interest, moneyness,
  freshness, and warning counts.
- Expandable chain, underlying, contract, and analysis warnings show stable
  codes, messages, affected fields, and field provenance when available.
- Sidebar text-size controls scale typography to 90%, 100%, 115%, or 130% and
  remember the preference in browser-local storage.
- Appearance controls select system, light, or dark mode and remember an
  explicit override in browser-local storage.
- Fifteen canonical strategy presets include long calls/puts, covered calls,
  protective puts, collars, cash-secured puts, verticals, straddles, strangles,
  butterflies, iron condors, call calendars/diagonals, and custom legs.
- Selected/template legs have editable buy/sell, quantity, and entry price.
- Named drafts can be saved, updated by name, reopened with fresh normalized
  quotes, and deleted without storing quote snapshots or credentials.
- Combined results include debit/credit, Greeks, max profit/loss, break-evens,
  expiration payoff chart, scenario table, assumptions, and warnings.
- Provider-neutral models enforce instrument identity, timezone-aware data,
  Decimal values, provenance, namespaced extensions, and position invariants.

Example position-analysis arguments:

```json
{
  "legs": [
    {
      "symbol": "SPY300118C00095000",
      "asset_type": "option",
      "quantity": "1",
      "average_open_price": "6"
    },
    {
      "symbol": "SPY300118C00100000",
      "asset_type": "option",
      "quantity": "-1",
      "average_open_price": "3"
    }
  ],
  "valuation_mode": "mark",
  "scenario_moves": ["-0.10", "0", "0.10"]
}
```

Option prices and Greeks are treated as per underlying unit and multiplied by
the contract multiplier. `max_loss` is the minimum profit/loss value, so a loss
is represented as a negative number. Delta-gamma scenarios hold volatility and
time constant; they are local approximations, not forecasts.

Handled tool failures return a non-null `error` object with a stable category,
retryability, reauthorization flag, and sanitized schema field paths. Successful
tool results have `error: null`.

## Local setup and verification

Install `uv`, then run:

```console
uv sync --all-groups
make check
make web-sync
make web-build
```

This workspace also has an ignored local `uv` bootstrap, so the same verification
can be run without a system installation:

```console
make check UV=.uv-bootstrap/bin/uv
```

Run the stdio server with:

```console
uv run options-analysis-mcp
```

The process waits for MCP messages on standard input and does not print a normal
interactive prompt.

## Browser UI

The repository includes the latest production bundle. Start the complete local
application with one process:

```console
make web-api
```

Open `http://127.0.0.1:8000`. The committed default uses deterministic fake
data, requires no credentials, and makes no external font or data request. The
API binds only to loopback. Responses include a same-origin content security
policy and related browser protections.

For frontend development, run `make web-api` and `make web-ui` in separate
terminals and open `http://127.0.0.1:5173`. Run `make web-build` after UI changes
to refresh the packaged static bundle.

The watchlist database defaults to
`~/Library/Application Support/options-analysis-mcp/state.sqlite3`. Override it
with the absolute `OPTIONS_ANALYSIS_STATE_DB_PATH` setting when needed.

## Credential-free replay data

Generate a private synthetic starter bundle and run the complete app through
the replay adapter:

```console
uv run options-analysis-replay-sample --output /private/tmp/options-replay.json
OPTIONS_ANALYSIS_ENABLED_PROVIDERS='["replay"]' \
OPTIONS_ANALYSIS_DEFAULT_MARKET_DATA_PROVIDER=replay \
OPTIONS_ANALYSIS_REPLAY_BUNDLE_PATH=/private/tmp/options-replay.json \
uv run options-analysis-web
```

The bundle is canonical data, not a saved vendor response. Keep real captures
outside Git, check the source license before recording them, sanitize private
fields, and never automate a web page that disallows extraction.

## Schwab local authorization

Copy `.env.example` to the ignored `.env`, set the application client ID,
secret, and exact registered callback, and add `schwab` to
`OPTIONS_ANALYSIS_ENABLED_PROVIDERS`. Never commit `.env`.

Then run:

```console
uv run options-analysis-schwab-auth
```

The command opens the provider authorization page (unless `--no-open` is used)
and asks you to paste the full callback URL into hidden terminal input. Tokens
default to a user-only file under macOS Application Support, outside the repo.

To opt into one narrow read-only gateway check:

```console
OPTIONS_ANALYSIS_ALLOW_LIVE_SMOKE_TESTS=true \
  uv run options-analysis-schwab-smoke --symbol SPY
```

The smoke command reports only response shape metadata, not the quote payload.
The configured endpoint defaults must be confirmed against the current Schwab
developer portal during this first activation.

## Safety boundary

The planned initial system can read market data and, when a configured adapter
has appropriate read-only account access, positions. It will not place,
replace, or cancel orders.

Never commit an application secret, access token, refresh token, account number,
or captured Schwab response containing private account data.

## Documentation

- `docs/OPERATIONS.md` — setup, authorization, routine use, and troubleshooting.
- `SECURITY.md` — threat boundary, secret handling, and incident response.
- `docs/MCP_HOSTS.md` — generic local stdio host configuration.
- `docs/PROVIDERS.md` — adapter API, entry points, mapping rules, and conformance.
- `docs/RELEASE.md` — quality, build, version, Git, and tag checklist.
- `docs/MILESTONE_6A.md` — browser foundation contract and next UI work.
- `docs/MILESTONE_6B.md` — persistent watchlist design and verification.
- `docs/MILESTONE_6C.md` — chain exploration and contract-selection contract.
- `docs/MILESTONE_6D.md` — strategy builder and combined-analysis contract.
- `docs/MILESTONE_6E.md` — packaged browser delivery and accessibility hardening.
- `docs/MILESTONE_6F.md` — expanded strategy catalog and calendar workflows.
- `docs/MILESTONE_6G.md` — persistent named strategy drafts.
- `docs/MILESTONE_6H.md` — expandable data-quality and analysis warnings.
- `docs/MILESTONE_6I.md` — adjustable, locally persisted interface typography.
- `docs/MILESTONE_6J.md` — underlying price history API and responsive chart.
- `docs/MILESTONE_6K.md` — validated local snapshot/replay provider.
- `docs/MILESTONE_6L.md` — persistent system/light/dark appearance themes.
- `docs/MILESTONE_6M.md` — extensible technical indicators and moving-average
  chart overlays.
- `docs/MILESTONE_6N.md` — short-term SMA 10 chart overlay.
- `docs/MILESTONE_*.md` — durable implementation and verification decisions.
- `TODO.md` — ordered durable work queue for this and future sessions.

## Resume

Read `STATUS.md` for the exact checkpoint. Streaming remains optional and should
be added only after live use demonstrates that bounded snapshot reads are too
slow for the analysis workflow.
