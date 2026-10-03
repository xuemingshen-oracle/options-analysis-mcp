.PHONY: sync web-sync format lint type test check build release-check run web-api web-ui web-test web-build web-e2e

UV ?= uv

sync:
	$(UV) sync --all-groups

web-sync:
	cd ui && npm ci

format:
	$(UV) run ruff format .

lint:
	$(UV) run ruff check .

type:
	$(UV) run mypy

test:
	$(UV) run pytest

check:
	$(UV) run ruff format --check .
	$(UV) run ruff check .
	$(UV) run mypy
	$(UV) run pytest

build:
	$(UV) build

release-check: check web-test web-build build

run:
	$(UV) run options-analysis-mcp

web-api:
	$(UV) run options-analysis-web

web-ui:
	cd ui && npm run dev

web-test:
	cd ui && npm test

web-build:
	cd ui && npm run build

web-e2e:
	cd ui && npm run test:e2e
