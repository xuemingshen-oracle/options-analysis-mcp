import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from options_analysis.config import AppSettings
from options_analysis.web import create_app


@pytest.fixture
def app(tmp_path) -> FastAPI:  # type: ignore[no-untyped-def]
    return create_app(
        AppSettings(_env_file=None, state_db_path=tmp_path / "state.db"),
        static_dir=tmp_path / "not-built",
    )


@pytest.mark.asyncio
async def test_info_and_provider_endpoints_are_read_only(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        info = await client.get("/api/v1/info")
        providers = await client.get("/api/v1/providers")

    assert info.status_code == 200
    assert info.json()["info"] == {
        "name": "options-analysis",
        "version": "0.9.0",
        "environment": "development",
        "read_only": True,
        "default_market_data_provider": "fake",
        "frontend_available": False,
    }
    assert info.json()["error"] is None
    assert providers.status_code == 200
    assert providers.json()["providers"][0]["provider_id"] == "fake"


@pytest.mark.asyncio
async def test_workspace_combines_quote_expirations_and_filtered_chain(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/workspaces/spy",
            params={
                "expiration": "2030-01-18",
                "strike_from": 100,
                "strike_to": 100,
                "limit": 2,
            },
        )

    assert response.status_code == 200
    result = response.json()
    assert result["error"] is None
    assert result["workspace"]["symbol"] == "SPY"
    assert result["workspace"]["quote"]["mark"] == "100.00"
    assert result["workspace"]["expirations"] == ["2030-01-18", "2030-02-15"]
    contracts = result["workspace"]["chain"]["contracts"]
    assert len(contracts) == 2
    assert {item["instrument"]["option"]["strike"] for item in contracts} == {"100"}
    assert {item["instrument"]["option"]["put_call"] for item in contracts} == {
        "call",
        "put",
    }


@pytest.mark.asyncio
async def test_workspace_errors_are_stable_and_secret_safe(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        unknown = await client.get(
            "/api/v1/workspaces/SPY", params={"provider": "disabled"}
        )
        invalid = await client.get("/api/v1/workspaces/SPY", params={"limit": 1000})

    assert unknown.status_code == 400
    assert unknown.json()["error"]["category"] == "configuration"
    assert unknown.json()["error"]["retryable"] is False
    assert invalid.status_code == 422
    assert invalid.json()["error"]["category"] == "validation"
    assert invalid.json()["error"]["field_paths"] == ["limit"]


@pytest.mark.parametrize(
    ("resolution", "expected_count"),
    (("1m", 390), ("5m", 390), ("1d", 252), ("1w", 260), ("1mo", 236)),
)
@pytest.mark.asyncio
async def test_price_history_is_bounded_ordered_and_provider_neutral(  # type: ignore[no-untyped-def]
    app, resolution: str, expected_count: int
) -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/price-history/spy",
            params={
                "resolution": resolution,
                "end": "2026-09-14T12:00:00Z",
            },
        )

    assert response.status_code == 200
    history = response.json()["history"]
    assert history["provider_id"] == "fake"
    assert history["symbol"] == "SPY"
    assert history["resolution"] == resolution
    assert history["end"] == "2026-09-14T12:00:00Z"
    assert len(history["bars"]) == expected_count
    assert history["truncated"] is False
    assert history["bars"][0]["start"] < history["bars"][-1]["start"]
    assert history["bars"][-1]["close"] == "100.000"


@pytest.mark.asyncio
async def test_price_history_rejects_unsupported_resolution(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/price-history/SPY", params={"resolution": "2m"}
        )

    assert response.status_code == 422
    assert response.json()["error"]["field_paths"] == ["resolution"]


@pytest.mark.asyncio
async def test_price_history_calculates_requested_moving_average_overlays(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/price-history/SPY",
            params=[
                ("resolution", "1d"),
                ("end", "2026-09-14T12:00:00Z"),
                ("indicator", "sma:20"),
                ("indicator", "sma:50"),
            ],
        )
        catalog = await client.get("/api/v1/technical-indicators")

    assert response.status_code == 200
    indicators = response.json()["history"]["indicators"]
    assert [item["spec"] for item in indicators] == ["sma:20", "sma:50"]
    assert [item["chart_role"] for item in indicators] == [
        "price_overlay",
        "price_overlay",
    ]
    assert [len(item["points"]) for item in indicators] == [233, 203]
    assert indicators[0]["source_fields"] == ["close"]
    assert catalog.status_code == 200
    assert catalog.json()["indicators"][0]["example_specs"] == [
        "sma:10",
        "sma:20",
        "sma:50",
    ]


@pytest.mark.asyncio
async def test_price_history_rejects_invalid_indicator_spec(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/price-history/SPY", params={"indicator": "sma:1"}
        )

    assert response.status_code == 400
    assert response.json()["error"]["category"] == "validation"
    assert "between 2 and 500" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_local_vite_origin_is_allowed(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.options(
            "/api/v1/workspaces/SPY",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "DELETE" in response.headers["access-control-allow-methods"]


@pytest.mark.asyncio
async def test_watchlist_crud_is_idempotent_and_persistent(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        initial = await client.get("/api/v1/watchlist")
        added = await client.post("/api/v1/watchlist", json={"symbol": " aapl "})
        duplicate = await client.post("/api/v1/watchlist", json={"symbol": "AAPL"})
        removed = await client.delete("/api/v1/watchlist/QQQ")

    assert [item["symbol"] for item in initial.json()["items"]] == [
        "SPY",
        "QQQ",
        "IWM",
    ]
    assert added.status_code == 201
    assert [item["symbol"] for item in added.json()["items"]] == [
        "SPY",
        "QQQ",
        "IWM",
        "AAPL",
    ]
    assert len(duplicate.json()["items"]) == 4
    assert [item["symbol"] for item in removed.json()["items"]] == [
        "SPY",
        "IWM",
        "AAPL",
    ]


@pytest.mark.asyncio
async def test_watchlist_rejects_invalid_symbol(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/watchlist", json={"symbol": "not a symbol"}
        )

    assert response.status_code == 400
    assert response.json()["error"]["category"] == "validation"
    assert "at most 12" in response.json()["error"]["message"]


@pytest.mark.asyncio
async def test_strategy_catalog_and_position_analysis(app) -> None:  # type: ignore[no-untyped-def]
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        catalog = await client.get("/api/v1/strategies")
        analysis = await client.post(
            "/api/v1/analyses/positions",
            json={
                "legs": [
                    {
                        "symbol": "SPY300118C00095000",
                        "asset_type": "option",
                        "quantity": "1",
                        "average_open_price": "6",
                    },
                    {
                        "symbol": "SPY300118C00100000",
                        "asset_type": "option",
                        "quantity": "-1",
                        "average_open_price": "3",
                    },
                ],
                "scenario_moves": ["-0.10", "0", "0.10"],
            },
        )

    assert catalog.status_code == 200
    catalog_items = catalog.json()["strategies"]
    assert catalog_items[0]["template_id"] == "long_call"
    assert len(catalog_items) == 15
    calendar = next(
        item for item in catalog_items if item["template_id"] == "call_calendar"
    )
    assert [leg["expiration_order"] for leg in calendar["legs"]] == [0, 1]
    assert analysis.status_code == 200
    assert analysis.json()["analysis"]["max_profit"] == "200"
    assert analysis.json()["analysis"]["break_even_prices"] == ["98"]


@pytest.mark.asyncio
async def test_bundled_frontend_and_security_headers_are_served(tmp_path) -> None:  # type: ignore[no-untyped-def]
    static = tmp_path / "static"
    assets = static / "assets"
    assets.mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><title>Test UI</title>")
    (assets / "app.js").write_text("export {}")
    bundled = create_app(
        AppSettings(_env_file=None, state_db_path=tmp_path / "state.db"),
        static_dir=static,
    )

    async with AsyncClient(
        transport=ASGITransport(app=bundled), base_url="http://test"
    ) as client:
        root = await client.get("/")
        asset = await client.get("/assets/app.js")
        info = await client.get("/api/v1/info")

    assert root.status_code == 200
    assert "Test UI" in root.text
    assert asset.status_code == 200
    assert root.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in root.headers["content-security-policy"]
    assert info.json()["info"]["frontend_available"] is True


@pytest.mark.asyncio
async def test_strategy_draft_crud_is_persistent_and_name_upserts(app) -> None:  # type: ignore[no-untyped-def]
    request = {
        "name": "SPY collar",
        "underlying_symbol": "SPY",
        "provider_id": "fake",
        "strategy_template_id": "collar",
        "legs": [
            {
                "symbol": "SPY",
                "provider_symbol": "SPY",
                "asset_type": "etf",
                "quantity": "100",
                "average_open_price": "100",
            },
            {
                "symbol": "SPY300118P00095000",
                "provider_symbol": "SPY300118P00095000",
                "asset_type": "option",
                "quantity": "1",
                "average_open_price": "2",
            },
        ],
    }
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        empty = await client.get("/api/v1/strategy-drafts")
        created = await client.post("/api/v1/strategy-drafts", json=request)
        request["name"] = "spy COLLAR"
        request["legs"][1]["quantity"] = "2"
        updated = await client.post("/api/v1/strategy-drafts", json=request)
        listed = await client.get("/api/v1/strategy-drafts")
        removed = await client.delete(
            f"/api/v1/strategy-drafts/{created.json()['draft']['draft_id']}"
        )

    assert empty.json()["drafts"] == []
    assert updated.json()["draft"]["draft_id"] == created.json()["draft"]["draft_id"]
    assert updated.json()["draft"]["legs"][1]["quantity"] == "2"
    assert listed.json()["drafts"] == [updated.json()["draft"]]
    assert removed.json()["drafts"] == []
