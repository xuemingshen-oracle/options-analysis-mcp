# Durable Project Backlog

Last updated: 2026-10-02

This file is the canonical cross-session task list. `STATUS.md` describes the
current checkpoint; this file records what remains and the order in which to do
it. Every milestone must update both files before commit.

## Workflow

Statuses are `in_progress`, `ready`, `blocked`, `backlog`, `deferred`, and
`done`. A new session should:

1. Read `STATUS.md`, this file, and the latest milestone note.
2. Finish the sole `in_progress` item, if present.
3. Otherwise take the lowest-numbered `ready` item whose dependencies are done.
4. Add verification evidence and update status before committing.
5. Keep stable IDs when tasks are refined; add child IDs instead of replacing
   history.

## Personal workbench checkpoint

Core work is on `eshen/main`; experiments remain on separate `eshen/*` branches.

| ID | Status | Work item | Completion evidence |
| --- | --- | --- | --- |
| LAB-010 | done | Provider-independent manual position analysis and exact signed accounting | Model identities, known payoffs, HTTP/MCP validation |
| LAB-020 | done | Price/time/IV roadmaps, mark-calibrated IV, per-leg value and scenario Greeks | Model/finite-difference tests; browser workflow tests |
| LAB-030 | done | Personal plans, loss budgets, named setups, backups and ChatGPT briefs | Persistence/import/export regression tests |
| LAB-040 | done | Responsive workbench and market-explorer transfer | Desktop/mobile/dark/large-text inspection and browser tests |
| LAB-050 | done | Explicit prototype correctness fixes for basis, scenario units and unsupported terms | Regressions in position analysis and explorer helpers |
| LAB-060 | ready | Evaluate hold/close/adjust report on `eshen/adjustment-lab` | Isolated prototype; inspect fills, fees and comparison assumptions before merging |
| LAB-070 | ready | Evaluate conditional distribution report on `eshen/distribution-lab` | Isolated prototype; do not present conditional estimates as forecasts |
| LAB-080 | backlog | Explore durable review-history snapshots and outcome attribution | Define desired review cadence and realized-cash-flow tracking |
| LAB-090 | backlog | Add an American exercise model only if scenario decisions need it | Benchmark against trusted pricing data and dividend schedules |
| LAB-100 | backlog | Consider authenticated server-side workbench sync for multiple devices | Current browser storage plus export/import remains explicit |

## Active sequence

| ID | Status | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| UI-010 | done | Milestone 6B: SQLite-backed watchlist service, CRUD API, and persistent React controls | UI-001 code | CRUD/restart tests, proxy CRUD check, release check |
| UI-011 | done | Desktop and narrow-viewport visual inspection | Working Chromium browser | Workbench and explorer browser QA; see docs/WORKBENCH_QA.md |
| UI-020 | done | Milestone 6C: chain explorer with strike range, expiration/DTE, side, liquidity, and moneyness filters | UI-010 | API filter and TypeScript view-model tests |
| UI-021 | done | Add sortable chain columns and clear stale/missing-data indicators | UI-020 | Sort tests and visible freshness/warning summary |
| UI-022 | done | Add contract selection from calls/puts into a draft leg tray | UI-020 | Buy/sell/quantity/remove UI with production build |
| UI-030 | done | Milestone 6D: canonical strategy-template catalog | UI-022 | Catalog and template-generation tests |
| UI-031 | done | Add editable signed legs for long call/put, covered call, verticals, butterflies, and iron condors | UI-030 | Hand-calculated iron-condor and signed-leg tests |
| UI-032 | done | Add combined debit/credit, Greeks, max profit/loss, and break-even results | UI-031 | Service/API tests and runtime proxy result |
| UI-033 | done | Add expiration payoff chart and scenario table with assumptions/warnings | UI-032 | Payoff geometry tests and production build |
| UI-040 | done | Milestone 6E: responsive/accessibility hardening and production static serving/packaging | UI-033 | Semantic/focus/reduced-motion tests by build, API static/header test, one-process startup, wheel inspection |
| UI-050 | done | Milestone 6F: expand catalog with protective put, collar, cash-secured put, straddle/strangle, and calendar/diagonal workflows | UI-040 | Fifteen catalog definitions, automatic second-expiration loading, draft/payoff fixtures |
| UI-051 | done | Milestone 6G: persist named strategy drafts separately from watchlists | UI-040 | Provider-neutral domain/service, SQLite restart CRUD, HTTP/UI save-load-delete tests |
| UI-052 | done | Milestone 6H: add expandable chain, per-contract, and analysis warning details | UI-040 | Accessible disclosures with field provenance and server-rendered component tests |
| UI-053 | done | Milestone 6I: adjustable, browser-persisted interface font size | Owner desktop feedback | Keyboard-operable 90–130% controls, persistence unit tests, production build |
| UI-054 | done | Milestone 6J: underlying price chart with 1-minute, 5-minute, daily, weekly, and monthly views | UI-053, provider history capability | Bounded HTTP history contract, responsive SVG chart, five-resolution API and rendering tests |
| UI-055 | done | Milestone 6L: persistent light, dark, and system-selected themes with accessible semantic color tokens | UI-054 | 30 frontend tests, contrast/token checks, pre-paint initializer, production build |
| UI-055A | done | Agent visual verification of light/dark modes at desktop and narrow widths; owner aesthetic feedback remains optional | UI-055 | Screenshots, no document overflow, 130% typography and accessibility checks |
| UI-056 | backlog | Evaluate optional additional palettes/accent customization after using light/dark modes | UI-055A | Owner-selected palette and contrast specification |
| UI-057 | done | Milestone 6M: provider-neutral SMA 20/50 overlays with independent chart controls | UI-054 | HTTP/MCP calculation contracts, UI rendering tests, production build |
| UI-058 | done | Milestone 6N: add SMA 10 as a curated short-term overlay | UI-057 | Updated discovery metadata, accessible control, theme color, tests, and production build |

## Technical indicators and signals

These remain separate from provider integration: calculators consume canonical
bars after normalization. Stable chart-role metadata determines whether a
future series belongs over price, in a lower panel, or as event markers.

| ID | Status | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| TECH-010 | done | Add indicator domain models, calculator protocol, discovery registry, bounded execution service, and Decimal SMA implementation | UI-054 | Exact arithmetic, ordering, validation, discovery, HTTP, and MCP tests |
| TECH-020 | backlog | Add exponential moving average and Bollinger Bands as price overlays | TECH-010 | Hand-calculated fixtures and generic-renderer coverage |
| TECH-030 | backlog | Add lower-panel layout and RSI, then MACD with independently scaled axes | TECH-010 | Exact fixtures, responsive/accessibility checks, no provider changes |
| TECH-040 | backlog | Replace curated overlay controls with catalog-driven indicator selection and bounded parameter editing | TECH-020, TECH-030 | Invalid-parameter UX and persisted chart preference tests |
| TECH-050 | backlog | Define event-marker/signal semantics, provenance, confidence, and non-advisory labels before adding crossover signals | TECH-020 | Design record and look-ahead-free deterministic tests |

## Schwab activation

These require the repository owner’s approved application and private local
credentials. Never put evidence containing tokens or private provider bodies in
Git or chat.

| ID | Status | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| LIVE-010 | blocked | Obtain replacement Schwab app credentials and complete OAuth only on the retained machine; never reuse the exposed/deactivated app credentials | Developer Support or replacement application | Safe auth-status summary only |
| LIVE-020 | blocked | Verify one stock quote, expirations, narrow chain, and selected option quotes | LIVE-010 | Shape/mapping checklist without response bodies |
| LIVE-030 | blocked | Run the browser workspace against Schwab and check freshness/rate behavior | LIVE-020, UI-020 | Redacted inspection notes |
| LIVE-040 | deferred | Evaluate read-only Trader API account positions | Trader API entitlement | Explicit go/no-go decision |

## Provider portability and richer data

| ID | Status | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| DATA-005 | done | Milestone 6K: versioned, size-bounded canonical snapshot/replay provider and synthetic generator | CORE-050, UI-054 | Shared conformance and loading/filter/history tests; no vendor data committed |
| DATA-010 | backlog | Select the second provider based on live vs historical needs; initial candidates are Tradier, Alpaca, Massive, ORATS, and Databento | LIVE-020 | Short decision record with current official API evidence |
| DATA-020 | backlog | Implement the selected provider through existing capability contracts | DATA-010 | Shared conformance suite passes without core-analysis changes |
| DATA-030 | backlog | Define snapshot provenance/synchronization rules if positions and quotes use different providers | DATA-020 | Mixed-source domain and warning tests |

## Backtesting and research

| ID | Status | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| BT-010 | backlog | Define backtest questions, strategy universe, fill model, and required historical fields | UI-033, DATA-010 | Backtest design decision record |
| BT-020 | backlog | Choose/licence historical option data with survivorship, corporate-action, quote, and timestamp coverage | BT-010 | Vendor/dataset validation report |
| BT-030 | backlog | Add immutable snapshot storage and versioned dataset schema | BT-020 | Reproducible import and integrity tests |
| BT-040 | backlog | Implement fills, slippage, assignment/exercise, expiration, dividends, fees, and early-close rules | BT-030 | Synthetic deterministic backtests |
| BT-050 | backlog | Add walk-forward reporting and guardrails against look-ahead/selection bias | BT-040 | Bias tests and reproducible report |

## Delivery and optional extensions

| ID | Status | Work item | Depends on | Completion evidence |
| --- | --- | --- | --- | --- |
| MOB-010 | backlog | Decide local desktop wrapper versus authenticated hosted/PWA mobile delivery | UI-040 | Deployment/security decision record |
| MOB-020 | backlog | Add TLS, authentication, host/origin controls, and deployment isolation before any LAN/mobile exposure | MOB-010 | Threat-model review and integration tests |
| STREAM-010 | deferred | Measure snapshot latency and decide whether streaming is justified | LIVE-030 | Recorded latency and go/no-go threshold |
| STREAM-020 | deferred | Implement bounded streaming adapter/cache only if STREAM-010 says go | STREAM-010 | Reconnect, resubscribe, freshness, and memory-bound tests |
| EXEC-010 | deferred | Reconsider trading/order execution as a separate project and threat model | Explicit owner request | New design approval; never implicit in a data-provider plug-in |

## Completed checkpoints

| ID | Status | Result |
| --- | --- | --- |
| CORE-000 | done | Design and cross-session handoff documentation |
| CORE-010 | done | Provider-pluggable offline skeleton and fake adapter |
| CORE-020 | done | Schwab OAuth and bounded read-only gateway code |
| CORE-030 | done | Normalized option market-data tools and adapter mapping |
| CORE-040 | done | Caller-supplied position enrichment and analytics |
| CORE-050 | done | Error/cache/security/packaging hardening |
| UI-001 | done | Milestone 6A FastAPI and responsive React browser foundation |
