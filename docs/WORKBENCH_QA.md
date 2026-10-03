# Workbench verification — 0.9.0

Validated on 2026-10-02, on macOS with Python 3.12 and Chromium. This record
describes automated and visual checks; it is not a claim that every market or
broker behavior is modeled.

## Core checks

| Check | Result |
| --- | --- |
| Ruff formatting and lint | Clean |
| Strict mypy | Clean, 66 source files |
| Python suite | 209 tests passed |
| TypeScript unit suite | 72 tests passed across 10 files |
| Chromium browser suite | 15 tests passed |
| React type checking and production build | Passed |
| Python source distribution and wheel | Built successfully |

Python regressions cover reference option prices, put/call parity, finite
difference Greeks, mark-to-IV inversion, calendar horizon handling, exact
payoff extrema and roots, multi-leg fees, signed credit accounting, assignment
disclosures, missing entry basis, provider valuation modes, risk sizing,
extreme/invalid inputs, tiny residual uncovered tails, and both HTTP and MCP
transports. Additional independent checks compared 200 generated portfolios
with a separately calculated terminal payoff grid and exercised 1,000 pricing
and IV round trips.

Browser tests exercise actual packaged assets against a local HTTP server:

- Editing entry prices/fees invalidates old results and changes payoff numbers.
- Calendar roadmaps stop at the first expiry and flag boundary Greeks.
- Custom roadmap dates, per-leg IV fitting and butterfly/short-put downside.
- Named setup and trade-plan persistence, backup/import and analysis briefs.
- Incomplete drafts preserve the saved library; saving retires stale Undo state.
- Failed analysis recovers; delayed responses cannot display results for newer
  inputs; blocked browser storage still permits analysis and export.
- Provider strategy transfer preserves the selected valuation and workspace.
- Delayed explorer draft restores use the latest valuation selection and are
  canceled when the user switches to another symbol.
- Both workspaces fit 1440, 768, 390 and 320 pixel viewports without document
  overflow. Wide financial tables scroll within their own panels.
- Workbench light/dark themes pass the axe WCAG 2 A/AA and 2.1 A/AA rules checked
  by the automated audit. Keyboard controls, visible field labels and chart
  slider are provided; this is not a complete assistive-technology audit.

Desktop and phone screenshots were inspected, including dark mode with 130%
text. The review caught and corrected tablet quote-panel overflow and cramped
mobile leg controls. The test runner regenerates screenshots in the ignored
`ui/test-results/` folder; the UI remains usable when horizontally scrolling
the option chain or scenario tables.

## Package smoke check

The built wheel was installed into an isolated temporary environment, reusing
existing dependency installations without importing application code from the
source checkout. All five console entry points resolved. The homepage and all
referenced JavaScript, CSS, theme, icon and manifest files served successfully.
An HTTP long-call example returned the expected $500 maximum loss; an actual
installed MCP stdio process returned a short put's $200 maximum profit and
$9,300 maximum loss. The wheel includes the provider contract helper and all
required static assets.

## Reproduce

```sh
uv sync --all-groups
make web-sync
make release-check
cd ui
npx playwright install chromium webkit
npm run test:e2e
```

The browser configuration forces the synthetic provider and an isolated
temporary SQLite database. Tests do not need brokerage credentials. If browser
binaries are installed outside the default cache, set
`PLAYWRIGHT_BROWSERS_PATH` consistently for installation and execution.

In the implementation environment, `uv` is also available at the ignored
`.uv-bootstrap/bin/uv`. Restricted network access prevented one fresh build
cache from resolving Hatchling; the distribution build subsequently completed
using the established dependency cache. The constituent lint/type/test/build
checks above all completed successfully.

## Experimental branches

- `eshen/adjustment-lab`: explicit hold/close/adjust cash ledger, bounded numeric
  inputs and precision regressions; 130 relevant tests passed. HTML reports
  were inspected at 1440 and 390 pixels.
- `eshen/distribution-lab`: 36 new tests, 245 total branch tests passed, with
  lint/type checks clean. Checks include digital-like probability regions,
  deterministic cases, break-even plateaus, tail integration and model-label
  validation. Desktop and mobile report screenshots were inspected.

## Verification limits

Schwab OAuth and live responses were not exercised. No broker orders, American
exercise engine, assignment path, margin requirement, tax lot accounting or
historical option backtest is implemented. Current marks remain explicit user
inputs or copied provider snapshots. A full screen-reader audit remains future
work; mobile browser coverage is recorded below. Workbench storage is local
to one browser origin; the JSON backup is the portable copy.

## Mobile follow-up — 2026-10-03

The phone workflow adds dedicated sections, collapsible legs, larger controls,
mobile chart/scenario layouts, safe-area navigation, and Safari Home Screen
metadata/icons. Desktop behavior remains covered by the existing suite.

| Check | Result |
| --- | --- |
| Python suite, including eight new server CLI checks | 217 passed |
| TypeScript unit suite | 72 passed |
| Desktop Chromium browser suite | 15 passed |
| iPhone/WebKit mobile browser suite | 6 passed |
| Android/Chromium mobile browser suite | 6 passed |
| Ruff formatting/lint and strict mypy | Clean |
| React type checking and production build | Passed |
| Python distributions and exact packaged-asset verification | Passed |

Mobile browser checks exercise actual packaged assets: changed entry prices
produce the expected new risk numbers, leg expansion preserves edits, all three
workbench sections fit narrow viewports, touch fields remain at least 44px high
with at least 16px text in portrait and landscape, and saved plans survive
reload and backup/import. A reduced editing viewport and simulated
`visualViewport` resize verify keyboard-triggered navigation hiding and
restoration. HTTP checks confirm manifest and icon delivery.
Large covered-call positions keep every axis label within the mobile SVG while
the chart inspector retains unabridged dollar amounts. Screenshot checks use
viewport captures: Playwright's full-page Chromium capture was observed to
disable coarse-pointer emulation during a later viewport change.

Visual review covered 320/390/430px phone widths, 844px landscape, 1440px desktop,
light/dark themes, and enlarged text. It caught native Safari selects ignoring
minimum height; the final styles use explicit sizing and styled arrows for touch
devices in both orientations. An additional WebKit axe run found no violations
of the checked WCAG 2 A/AA and 2.1 A/AA rules across Position, Analysis and Plan.

The server CLI retains its loopback default and validates port arguments. The
new [MOBILE.md](MOBILE.md) guide documents explicit LAN binding, Safari setup,
server availability, and browser/app-local backups. No offline cache, offline
pricing, authentication or device synchronization was added.

Browser emulation does not exercise the native Safari share sheet, an actual
Home Screen installation, physical screen cutouts or the real iOS keyboard.
Those require an iPhone check. The documented setup also depends on the user's
Wi-Fi and firewall configuration, which were not changed during implementation.
