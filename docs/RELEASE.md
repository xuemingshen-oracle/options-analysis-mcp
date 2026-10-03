# Release Checklist

1. Confirm the worktree contains no `.env`, token, private fixture, account ID,
   or captured provider response.
2. Update the version in `pyproject.toml` and
   `src/options_analysis/__init__.py` together.
3. Update `CHANGELOG.md`, `README.md`, `STATUS.md`, and the milestone note.
4. Run `make web-sync` when `ui/package-lock.json` changed.
5. Run `make web-e2e` after installing Chromium and WebKit with
   `npx playwright install chromium webkit`
   from `ui/`. Then run `make release-check` (or add `UV=.uv-bootstrap/bin/uv`). This includes
   the React type check and production build.
6. Inspect wheel contents and confirm `options_analysis.testing` and
   `options_analysis.web.static` are packaged.
7. Start the built environment over stdio and call `options_server_info`; start
   `options-analysis-web` and confirm `/`, `/api/v1/info`, and browser security
   headers from the single process.
8. Commit core application changes on `eshen/main`; keep speculative work on
   separate `eshen/*` branches until reviewed.
9. Push branches, tag a release, or merge to repository `main` only when requested.

Published package indexes and public releases are outside the current scope.
The private GitHub repository and milestone tags are the durable checkpoints.
