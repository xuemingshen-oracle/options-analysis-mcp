# Project Status and Continuation Handoff

Last updated: 2026-10-03

## Current state

Option Atlas 0.9.0 is developed on `eshen/main`. The default landing page is a
provider-independent personal position workbench; the original market explorer
remains available in a separate workspace tab. The shared conversation was
successfully reviewed and informed the accounting, price/date roadmaps,
short-option time-value breakdown and negative-delta/gamma exploration.
No private positions or conversation exports were added to the repository.

The workbench accepts signed stock/call/put legs, user entry/current prices,
explicit multipliers, dates and per-leg IV. It calculates exact compatible
expiry payoff/risk/break-evens and European price/time/IV scenarios, optionally
calibrating IV from entered marks. P/L since entry and change from today are
separate. Scenario dates, per-leg accounting, modeled Greeks, loss-budget sizing
and rule-based review make assumptions inspectable.

A browser-local library stores named setups and trade plans. JSON export/import
and a ChatGPT review brief make the data portable. Incomplete drafts survive
reload without erasing the library. Explorer drafts/watchlists remain in SQLite;
quoted positions can transfer into the workbench after entry basis is complete.

See `docs/WORKBENCH.md` for the accounting contract, model scope and commands.
The latest validation evidence is recorded in `docs/WORKBENCH_QA.md`.

The phone interface now has Position/Analysis/Plan sections, collapsible legs,
larger touch controls, readable charts/scenario cards, bottom navigation and
keyboard-aware actions. Safari Home Screen metadata/icons and an in-app help
dialog support a standalone launch. Start with `--host 0.0.0.0` for explicit
trusted-LAN access; the normal command remains loopback-only. The Mac/server
must stay running. See `docs/MOBILE.md` for installation and backup guidance.

Experiments are isolated from core UI and remain unmerged:

- `eshen/adjustment-lab`: explicit hold/close/adjust cash-flow comparison reports.
- `eshen/distribution-lab`: conditional lognormal probability/expectation reports
  for inspecting sensitivity to declared distribution assumptions.

Live Schwab activation remains a local configuration task. This work does not
claim a live provider check and does not place orders. The default market
explorer provider is synthetic. Manual workbench marks remain user supplied.
Prior developer-app credentials were deactivated; do not reuse them. Obtain
replacement credentials and authorize only on the retained machine.

Repository: https://github.com/xuemingshen-oracle/options-analysis-mcp

`TODO.md` remains the cross-session backlog. Use `eshen/*` branches; do not
resume the former `codex/milestone-*` naming convention.

## Milestone checklist

- [x] Milestone 0 — Design and handoff documentation
- [x] Milestone 1 — Offline project skeleton
- [x] Milestone 2 — OAuth and Schwab read-only gateway (offline code)
- [ ] Milestone 2 operational activation — owner OAuth and one live read
- [x] Milestone 3 — Option market-data tools (offline code)
- [ ] Milestone 3 operational activation — owner live mapping check
- [x] Milestone 4 — Caller-supplied position enrichment and analytics
- [ ] Optional Schwab account positions — requires Trader API entitlement
- [x] Milestone 5 — Hardening, documentation, and packaging
- [x] Milestone 6A — FastAPI and responsive React browser foundation
- [x] Milestone 6B — SQLite-backed persistent watchlists
- [x] Milestone 6C — Rich option-chain explorer
- [x] Milestone 6D — Strategy builder and combined analytics
- [x] Milestone 6E — Packaged browser delivery and responsive hardening
- [x] Milestone 6F — Expanded strategy catalog and multi-expiration workflows
- [x] Milestone 6G — Persistent named strategy drafts
- [x] Milestone 6H — Expandable warning and provenance details
- [x] Milestone 6I — Adjustable, browser-persisted interface typography
- [x] Milestone 6J — Underlying price charts and interval selection
- [x] Milestone 6K — Validated canonical snapshot/replay provider
- [x] Milestone 6L — Persistent light/dark/system visual themes
- [x] Milestone 6M — Extensible indicators and SMA 20/50 chart overlays
- [x] Milestone 6N — Short-term SMA 10 chart overlay
- [ ] Milestone 7 — Optional streaming; decision gate not met

## Browser interface

- `GET /api/v1/info` returns safe local runtime metadata.
- `GET /api/v1/providers` returns enabled provider capabilities.
- `GET /api/v1/workspaces/{symbol}` combines the normalized quote, expiration
  list, and bounded filtered option chain.
- `GET /api/v1/price-history/{symbol}` returns an ordered, maximum-500-bar
  underlying series at one of five bounded resolutions and accepts up to eight
  repeated `indicator` specifications.
- `GET /api/v1/technical-indicators` exposes calculator metadata, syntax, chart
  role, unit, and examples for client discovery.
- `make web-api` serves the bundled UI and API at `http://127.0.0.1:8000`.
- `make web-ui` starts the development-only Vite UI at
  `http://127.0.0.1:5173`.
- Watchlist changes persist through `/api/v1/watchlist` in a private local
  SQLite state file.
- The chain explorer displays paired calls/puts with provider-side strike
  bounds, local liquidity/moneyness filters, sortable detailed metrics, and a
  selected-contract draft tray.
- The HTTP strategy catalog and position-analysis endpoint support fifteen
  presets/custom legs without adding any order capability.
- Call calendars and diagonals fetch the next available expiration through the
  same normalized workspace endpoint; no provider-specific UI logic is added.
- Named strategy definitions support list, save/update, rehydrate, and delete
  operations through `/api/v1/strategy-drafts`.
- Warning disclosures preserve normalized quality codes and field-level source
  context instead of reducing quality signals to a count.
- Text-size controls offer 90%, 100%, 115%, and 130% modes, preserve native
  browser zoom, and keep the preference in browser-local storage.
- Appearance controls offer system, light, and dark modes with accessible
  pressed state and browser-local persistence.
- The underlying chart separates interval selection from provider logic and
  handles loading, no-data, and provider-error states without blocking options.
- SMA 10, SMA 20, and SMA 50 use complete close-price windows and can be shown
  or hidden independently; a period always means one bar at the selected
  resolution.
- Indicator definitions, result series, registry, and execution service reserve
  price-overlay, lower-panel, and event-marker roles for future calculators.
- The replay adapter supports the same quote, chain, selected-contract, and
  history capabilities using an immutable local canonical bundle.
- Production assets are packaged under `options_analysis.web.static`, use
  same-origin API calls, and receive a restrictive content security policy.

## Available MCP tools

- `options_server_info`
- `options_list_providers`
- `options_list_technical_indicators`
- `options_provider_auth_status`
- `options_get_underlying_quote`
- `options_get_option_expirations`
- `options_get_option_chain`
- `options_get_option_quotes`
- `options_get_price_history` (optional registered indicator specifications)
- `options_analyze_manual_position`
- `options_analyze_positions`

Every tool result now includes `error`; it is null on success and contains a
stable, secret-safe detail object for handled failures.

## Hardening delivered

- GET-only Schwab gateway, exact OAuth callback/state validation, private atomic
  token storage, bounded timeouts/retries/response bytes, and no redirect follow.
- Provider-normalized values, provenance, quality warnings, and sanitized schema
  drift paths.
- Bounded one-second LRU/TTL cache for repeated underlying quotes only.
- Packaged `options_analysis.testing.assert_market_data_provider_contract`.
- Operations, security, MCP-host, provider, release, milestone, and changelog
  documentation.
- `make release-check` performs formatting, lint, strict typing, tests, and
  package builds.

## Verification evidence

The 0.9.0 workbench passes Python formatting/lint and strict typing, 209 Python
tests, 72 TypeScript tests and 15 Chromium browser tests. Browser coverage checks accounting, calendar
boundaries, persistence, provider transfer, accessibility and responsive layout.
The React production bundle and Python source/wheel distributions build.
See `docs/WORKBENCH_QA.md` for commands, scope and remaining verification limits.
Earlier milestone evidence remains in `docs/MILESTONE_6N.md`.

## Required owner activation

1. Replace the exposed developer credentials; do not reactivate or reuse them.
2. Follow `docs/MILESTONE_2.md` and `docs/OPERATIONS.md` for local OAuth on the
   retained machine.
3. Confirm current official endpoints and the mapping assumptions in
   `docs/MILESTONE_3.md`.
4. Run one narrow live stock quote, expiration list, chain, selected option
   quote, and position analysis without saving provider bodies.
5. Decide whether Trader API Individual is available and whether account
   positions are worth adding.

Never paste or commit credentials, callbacks, token values, account data, or
captured live responses.

## Streaming decision gate

Milestone 7 is deliberately optional. Do not implement it until live use shows
that snapshot latency is inadequate. If needed, implement the existing
`StreamingProvider` contract with bounded symbol subscriptions, bounded cache,
freshness timestamps, reconnect/resubscribe tests, and no order functionality.

## Resume prompt for another session

Continue the options-analysis project from `eshen/main`. Read `README.md`,
`SECURITY.md`, `STATUS.md`, `TODO.md`, and `docs/WORKBENCH.md`. Inspect Git before
editing. Discuss a new objective if no task is already authorized; do not merge
the isolated experiments by default. Preserve the provider-neutral, local-only,
read-only, bounded, and secret-safe boundaries. Run relevant checks and commit
on `eshen/*`. Push or publish only when requested. Never commit secrets or
private responses.
