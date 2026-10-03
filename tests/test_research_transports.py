from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from mcp import Client

from options_analysis.config import AppSettings
from options_analysis.mcp.server import create_server
from options_analysis.web.app import create_app

PAYLOAD = {
    "symbol": "TEST",
    "spot": "100",
    "valuation_date": "2026-10-02",
    "legs": [
        {
            "kind": "call",
            "quantity": "1",
            "entry_price": "5",
            "strike": "100",
            "expiration": "2026-11-01",
        }
    ],
}


@pytest.mark.asyncio
async def test_manual_research_http_success_and_validation(tmp_path: Path) -> None:
    app = create_app(
        AppSettings(_env_file=None, state_db_path=tmp_path / "state.db"),
        static_dir=tmp_path / "missing",
    )
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/v1/research/analyze", json=PAYLOAD)
        assert response.status_code == 200
        result = response.json()
        assert result["error"] is None
        assert result["analysis"]["max_loss"] == "-500"
        assert result["analysis"]["max_profit_bounded"] is False
        assert result["analysis"]["timeline"]
        invalid = await client.post(
            "/api/v1/research/analyze", json=dict(PAYLOAD, spot="NaN")
        )
        assert invalid.status_code == 422
        assert invalid.json()["error"]["category"] == "validation"


@pytest.mark.asyncio
async def test_manual_research_mcp_schema_and_result() -> None:
    async with Client(create_server(AppSettings(_env_file=None))) as client:
        listed = await client.list_tools()
        tool = next(
            tool
            for tool in listed.tools
            if tool.name == "options_analyze_manual_position"
        )
        assert tool.output_schema is not None
        result = await client.call_tool(
            "options_analyze_manual_position", {"request": PAYLOAD}
        )
        assert result.is_error is False
        assert result.structured_content is not None
        assert result.structured_content["analysis"]["max_loss"] == "-500"
