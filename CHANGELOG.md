# Changelog

## Unreleased — mobile follow-up

- Add phone-specific Position/Analysis/Plan sections, collapsible legs, larger
  touch controls, readable payoff/scenario views and keyboard-aware actions.
- Add safe-area bottom navigation, a mobile settings/help dialog, and improved
  market-explorer controls while retaining the desktop layout and themes.
- Supply Safari Home Screen metadata and app icons with standalone launch
  support; document same-Wi-Fi installation and browser-local backups.
- Accept explicit `--host`/`--port` server arguments for trusted-LAN access;
  retain the default `127.0.0.1:8000` startup.
- Add iPhone/WebKit and Android/Chromium browser regression coverage.

## 0.9.0 — 2026-10-02

- Make the provider-independent position workbench the main application flow,
  with signed stock/call/put legs, exact terminal risk, per-leg accounting,
  modeled price/time/IV scenarios, optional mark-calibrated IV, and scenario
  delta/gamma roadmaps.
- Keep entry P/L and change from today separate; include explicit fee reserves,
  loss-budget sizing, assumption disclosures and deterministic review findings.
- Add saved personal setups, an autosaved trading plan, JSON backup/import and
  local ChatGPT review briefs. Preserve incomplete drafts without losing the library.
- Connect quoted market-explorer strategies to manual research; expose
  mark/midpoint/closing valuation and retain drafts when switching symbols.
- Correct scenario percentages, unknown entry basis, incomplete Greeks,
  liquidation fallback disclosure, nonstandard-deliverable guards and payoff tails.
- Add HTTP/MCP manual-position analysis, browser workflow tests and responsive
  visual checks. Bundle the production UI for one-process local use.
- Protect saved setups from stale Undo snapshots, preserve edits through
  analysis failures, and reject stale draft restores after navigation.
- Keep the workbench available when browser storage is blocked, with portable
  JSON export and an explicit persistence notice.
- Keep adjustment and probability-assumption experiments on separate
  `eshen/*` branches.

## 0.8.1 — 2026-09-14

- Added SMA 10 as an independently selectable short-term price overlay beside
  SMA 20 and SMA 50.
- Added a theme-aware third indicator color and advertised SMA 10 through the
  shared HTTP/MCP indicator catalog.

## 0.8.0 — 2026-09-14

- Added provider-neutral technical-indicator definitions, series, calculator
  protocol, registry, and bounded execution service.
- Added exact Decimal-based simple moving averages and discoverable HTTP/MCP
  catalog contracts, with optional indicator output on price-history requests.
- Added independently selectable SMA 20 and SMA 50 overlays to every underlying
  chart resolution, with warm-up data preserved before visible-bar truncation.
- Reserved chart roles and units for later price overlays, lower panels, and
  event markers without adding indicator logic to provider adapters.

## 0.7.1 — 2026-09-14

- Added keyboard-operable system, light, and dark appearance controls with an
  accessible pressed-state group and browser-local persistence.
- Applied valid stored overrides before application mount while keeping system
  mode responsive to device appearance changes.
- Replaced component-level color literals with semantic palette tokens across
  charts, tables, panels, warnings, forms, and focus states.
- Added preference, accessible-markup, token-integrity, pre-paint initializer,
  and WCAG contrast tests.

## 0.7.0 — 2026-09-14

- Added a strict versioned replay bundle for canonical quote, option-chain, and
  multi-resolution underlying-history data.
- Added a credential-free `replay` provider with bounded loading, provider-side
  query filtering, immutable playback, and retained original source identity.
- Added a local synthetic sample generator plus shared provider conformance,
  validation, remapping, and history-window tests.
- Documented data licensing, provenance, privacy, and safe local replay use;
  no scraped or vendor response data is committed.

## 0.6.9 — 2026-09-14

- Added a bounded provider-neutral price-history HTTP endpoint with one-minute,
  five-minute, daily, weekly, and monthly windows.
- Added a responsive accessible underlying-price chart with interval controls,
  close series, range, net change, dates, provider, and loading/error states.
- Expanded deterministic fake history to realistic multi-bar series and added
  five-resolution API, geometry, and server-rendering tests.
- Documented Schwab portal app registration and safely canonicalized equivalent
  root callback URL forms without weakening host, path, or OAuth-state checks.

## 0.6.8 — 2026-09-14

- Added keyboard-operable interface text-size controls for 90%, 100%, 115%,
  and 130% modes, with one-click reset.
- Persisted the preference in browser-local storage with safe fallback when
  storage is unavailable.
- Converted interface typography to root-relative units while retaining the
  mobile 16-pixel form-control minimum and native browser zoom.
- Added unit coverage for normalization, bounded stepping, and persistence.

## 0.6.7 — 2026-09-14

- Added reusable accessible warning disclosures for underlying quotes, option
  chains, individual call/put contracts, and combined analysis.
- Exposed stable warning codes, human-readable messages, affected field names,
  and normalized field provenance when available.
- Separated analysis assumptions from data-quality warnings in the UI.
- Added server-rendered component tests for empty, detailed, and compact warning
  states.

## 0.6.6 — 2026-09-14

- Added provider-neutral saved-strategy definitions and a dedicated SQLite
  repository/service alongside, but separate from, watchlist persistence.
- Added list, case-insensitive save/update, and delete HTTP contracts with
  stable draft IDs and bounded validated legs.
- Added browser controls to name, save, reopen with current provider quotes,
  update, and delete strategy setups.
- Added restart, idempotency, validation, HTTP, and frontend rehydration tests.

## 0.6.5 — 2026-09-14

- Expanded the provider-neutral catalog from eight to fifteen templates with
  protective puts, collars, cash-secured puts, straddles, strangles, call
  calendars, and call diagonals.
- Added explicit expiration-order metadata and a volatile strategy outlook.
- Added automatic next-expiration loading for calendar and diagonal drafts
  without provider-specific frontend logic.
- Added hand-calculated payoff fixtures for protective puts, collars,
  cash-secured puts, straddles, and strangles plus multi-date draft tests.

## 0.6.4 — 2026-09-14

- Bundled the production React assets into the Python distribution so one
  loopback FastAPI process serves both the browser workspace and API.
- Added same-origin content security, no-referrer, MIME-sniffing, and framing
  protections plus API coverage for static delivery and headers.
- Improved keyboard semantics, visible focus, screen-reader status text, touch
  targets, narrow-screen controls, and reduced-motion behavior.
- Added a minimal local web-app manifest and durable Milestone 6E handoff.

## 0.6.3 — 2026-09-14

- Added a provider-neutral catalog for long calls/puts, covered calls, bullish
  and bearish verticals, long call butterflies, iron condors, and custom legs.
- Added a read-only HTTP position-analysis endpoint over the existing service.
- Added one-click template-to-leg generation, editable action/quantity/entry
  values, combined debit/credit and Greeks, payoff chart, break-evens, bounded
  risk, scenario table, assumptions, and warnings.
- Expanded deterministic option pricing and added hand-calculated iron-condor,
  template-generation, signed-leg, and payoff-chart tests.

## 0.6.2 — 2026-09-14

- Added provider-side strike bounds and local moneyness, open-interest, and
  bid/ask spread filters to the option-chain explorer.
- Added sortable strike, IV, and open-interest columns with delta, liquidity,
  freshness, and data-quality visibility.
- Added contract selection into editable buy/sell draft legs.
- Added Vitest coverage for chain pairing, filtering, sorting, spread, and DTE
  calculations; frontend tests now run in the release check.

## 0.6.1 — 2026-09-14

- Added a provider-neutral watchlist service and SQLite persistence adapter.
- Added idempotent list/add/remove HTTP endpoints and connected the React
  controls to server-side persistence.
- Added first-run defaults, explicit empty-list preservation, symbol
  validation, private database permissions, and restart-safe tests.

## 0.6.0 — 2026-09-14

- Added a local-only FastAPI interface beside MCP using the same application
  services and provider routing.
- Added a responsive React/TypeScript/Vite research workspace with an editable
  in-memory watchlist, quote summary, expiration filters, and option-chain view.
- Added transport-neutral structured errors shared by MCP and HTTP.
- Added HTTP contract tests and frontend production-build verification.

## 0.5.0 — 2026-09-14

- Added stable structured MCP error details and sanitized schema paths.
- Added a bounded process-local TTL cache for repeated underlying snapshots.
- Packaged the provider conformance helper for external adapter authors.
- Added operating, security, MCP-host, provider, and release guides.

## 0.4.0 — 2026-09-14

- Added caller-supplied position enrichment and first option analytics.

## 0.3.0 — 2026-09-14

- Added normalized market-data tools and Schwab response mapping.

## 0.2.0 — 2026-09-14

- Added Schwab OAuth, token storage, read-only gateway, and auth status.

## 0.1.0 — 2026-09-14

- Added the provider-pluggable offline skeleton and fake provider.
