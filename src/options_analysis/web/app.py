"""FastAPI facade over the reusable application services."""

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import FastAPI, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from options_analysis import __version__
from options_analysis.analytics.research import analyze_manual_position
from options_analysis.bootstrap import Application, build_application
from options_analysis.config import AppSettings
from options_analysis.domain import PutCall, StrategyDraftDefinition
from options_analysis.domain.research import ManualResearchRequest
from options_analysis.errors import ErrorCategory, ErrorDetail, error_detail
from options_analysis.providers import OptionChainQuery, PriceHistoryQuery
from options_analysis.providers.errors import ProviderError
from options_analysis.web.models import (
    AddWatchlistItemRequest,
    AnalyzePositionsRequest,
    ManualResearchResult,
    PositionAnalysisResult,
    PriceHistoryResult,
    PriceHistorySnapshot,
    ProviderListResult,
    ProviderSummary,
    ServerInfo,
    ServerInfoResult,
    StrategyCatalogResult,
    StrategyDraftListResult,
    StrategyDraftResult,
    TechnicalIndicatorCatalogResult,
    WatchlistResult,
    WorkspaceResult,
    WorkspaceSnapshot,
)

_LOCAL_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)

HistoryResolution = Literal["1m", "5m", "1d", "1w", "1mo"]
_HISTORY_WINDOWS: dict[str, timedelta] = {
    "1m": timedelta(days=1),
    "5m": timedelta(days=7),
    "1d": timedelta(days=365),
    "1w": timedelta(days=365 * 5),
    "1mo": timedelta(days=365 * 20),
}
_HISTORY_RESPONSE_LIMIT = 500


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; "
            "form-action 'self'; img-src 'self'; script-src 'self'; "
            "style-src 'self'; connect-src 'self'"
        )
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


def bundled_frontend_directory() -> Path:
    return Path(__file__).with_name("static")


def _error_status(detail: ErrorDetail) -> int:
    return {
        ErrorCategory.AUTHORIZATION: 401,
        ErrorCategory.ENTITLEMENT: 403,
        ErrorCategory.NOT_FOUND: 404,
        ErrorCategory.RATE_LIMIT: 429,
        ErrorCategory.UPSTREAM_UNAVAILABLE: 503,
        ErrorCategory.UPSTREAM_SCHEMA: 502,
    }.get(detail.category, 400)


def _error_response(
    detail: ErrorDetail, status_code: int | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code or _error_status(detail),
        content=jsonable_encoder({"error": detail}),
    )


def create_app(
    settings: AppSettings | None = None,
    *,
    application: Application | None = None,
    static_dir: Path | None = None,
) -> FastAPI:
    """Build an isolated HTTP application for serving or tests."""

    resolved_application = application or build_application(settings)
    resolved_static_dir = static_dir or bundled_frontend_directory()
    frontend_available = (resolved_static_dir / "index.html").is_file()
    app = FastAPI(
        title="Options Analysis API",
        summary="Read-only provider-neutral market-data API for the browser UI",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(_LOCAL_ORIGINS),
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.add_middleware(SecurityHeadersMiddleware)

    async def handled_error(_: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, ProviderError)
        return _error_response(error_detail(error))

    async def invalid_value(_: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, ValueError)
        return _error_response(error_detail(error))

    async def invalid_request(_: Request, error: Exception) -> JSONResponse:
        assert isinstance(error, RequestValidationError)
        field_paths = tuple(
            ".".join(str(part) for part in item["loc"] if part != "query")
            for item in error.errors()[:5]
        )
        return _error_response(
            ErrorDetail(
                category=ErrorCategory.VALIDATION,
                message="request validation failed",
                retryable=False,
                field_paths=field_paths,
            ),
            422,
        )

    app.add_exception_handler(ProviderError, handled_error)
    app.add_exception_handler(ValueError, invalid_value)
    app.add_exception_handler(RequestValidationError, invalid_request)

    @app.get("/api/v1/info", response_model=ServerInfoResult)
    async def info() -> ServerInfoResult:
        public = resolved_application.settings.public_view()
        return ServerInfoResult(
            info=ServerInfo(
                name="options-analysis",
                version=__version__,
                environment=public.environment,
                read_only=True,
                default_market_data_provider=public.default_market_data_provider,
                frontend_available=frontend_available,
            )
        )

    @app.get("/api/v1/providers", response_model=ProviderListResult)
    async def providers() -> ProviderListResult:
        public = resolved_application.settings.public_view()
        return ProviderListResult(
            providers=tuple(
                ProviderSummary(
                    provider_id=status.descriptor.provider_id,
                    display_name=status.descriptor.display_name,
                    capabilities=tuple(
                        sorted(item.value for item in status.descriptor.capabilities)
                    ),
                    freshness_modes=tuple(
                        sorted(item.value for item in status.descriptor.freshness_modes)
                    ),
                    configured=status.configured,
                    ready=status.ready,
                    message=status.message,
                )
                for status in resolved_application.provider_service.list_statuses()
            ),
            default_market_data_provider=public.default_market_data_provider,
        )

    @app.get("/api/v1/workspaces/{symbol}", response_model=WorkspaceResult)
    async def workspace(
        symbol: str,
        provider: str | None = None,
        expiration: date | None = None,
        put_call: PutCall | None = None,
        strike_from: Annotated[Decimal | None, Query(gt=0)] = None,
        strike_to: Annotated[Decimal | None, Query(gt=0)] = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 40,
    ) -> WorkspaceResult:
        normalized = symbol.strip().upper()
        if not normalized:
            raise ValueError("symbol must not be empty")
        query = OptionChainQuery(
            underlying_symbol=normalized,
            expiration_from=expiration,
            expiration_to=expiration,
            put_call=put_call,
            strike_from=strike_from,
            strike_to=strike_to,
            limit=limit,
        )
        quote, expirations, chain = await asyncio.gather(
            resolved_application.market_data_service.get_underlying_quote(
                normalized, provider
            ),
            resolved_application.market_data_service.get_option_expirations(
                normalized, provider
            ),
            resolved_application.market_data_service.get_option_chain(query, provider),
        )
        return WorkspaceResult(
            workspace=WorkspaceSnapshot(
                provider_id=quote.provider_id,
                symbol=normalized,
                quote=quote,
                expirations=expirations,
                chain=chain,
            )
        )

    @app.get("/api/v1/watchlist", response_model=WatchlistResult)
    def watchlist() -> WatchlistResult:
        return WatchlistResult(
            items=resolved_application.watchlist_service.list_items()
        )

    @app.post(
        "/api/v1/watchlist",
        response_model=WatchlistResult,
        status_code=201,
    )
    def add_watchlist_item(request: AddWatchlistItemRequest) -> WatchlistResult:
        return WatchlistResult(
            items=resolved_application.watchlist_service.add(request.symbol)
        )

    @app.delete(
        "/api/v1/watchlist/{symbol}",
        response_model=WatchlistResult,
    )
    def delete_watchlist_item(symbol: str) -> WatchlistResult:
        return WatchlistResult(
            items=resolved_application.watchlist_service.remove(symbol)
        )

    @app.get("/api/v1/price-history/{symbol}", response_model=PriceHistoryResult)
    async def price_history(
        symbol: str,
        resolution: HistoryResolution = "1d",
        provider: str | None = None,
        end: datetime | None = None,
        indicator: Annotated[list[str] | None, Query()] = None,
    ) -> PriceHistoryResult:
        range_end = end or datetime.now(UTC)
        query = PriceHistoryQuery(
            symbol=symbol,
            start=range_end - _HISTORY_WINDOWS[resolution],
            end=range_end,
            resolution=resolution,
        )
        provider_bars = (
            await resolved_application.market_data_service.get_price_history(
                query, provider
            )
        )
        ordered = tuple(sorted(provider_bars, key=lambda bar: bar.start))
        calculated = resolved_application.technical_indicator_service.calculate(
            ordered, tuple(indicator or ())
        )
        truncated = len(ordered) > _HISTORY_RESPONSE_LIMIT
        bars = ordered[-_HISTORY_RESPONSE_LIMIT:]
        visible_timestamps = {bar.start for bar in bars}
        indicators = tuple(
            series.model_copy(
                update={
                    "points": tuple(
                        point
                        for point in series.points
                        if point.timestamp in visible_timestamps
                    )
                }
            )
            for series in calculated
        )
        default_provider = (
            resolved_application.settings.public_view().default_market_data_provider
        )
        return PriceHistoryResult(
            history=PriceHistorySnapshot(
                provider_id=(
                    bars[0].provider_id if bars else (provider or default_provider)
                ),
                symbol=query.symbol,
                resolution=resolution,
                start=query.start,
                end=query.end,
                bars=bars,
                indicators=indicators,
                truncated=truncated,
            )
        )

    @app.get(
        "/api/v1/technical-indicators",
        response_model=TechnicalIndicatorCatalogResult,
    )
    def technical_indicators() -> TechnicalIndicatorCatalogResult:
        return TechnicalIndicatorCatalogResult(
            indicators=(
                resolved_application.technical_indicator_service.list_definitions()
            )
        )

    @app.get("/api/v1/strategies", response_model=StrategyCatalogResult)
    def strategies() -> StrategyCatalogResult:
        return StrategyCatalogResult(
            strategies=resolved_application.strategy_catalog_service.list_templates()
        )

    @app.get("/api/v1/strategy-drafts", response_model=StrategyDraftListResult)
    def strategy_drafts() -> StrategyDraftListResult:
        return StrategyDraftListResult(
            drafts=resolved_application.strategy_draft_service.list_drafts()
        )

    @app.post("/api/v1/strategy-drafts", response_model=StrategyDraftResult)
    def save_strategy_draft(
        request: StrategyDraftDefinition,
    ) -> StrategyDraftResult:
        return StrategyDraftResult(
            draft=resolved_application.strategy_draft_service.save(request)
        )

    @app.delete(
        "/api/v1/strategy-drafts/{draft_id}",
        response_model=StrategyDraftListResult,
    )
    def delete_strategy_draft(draft_id: UUID) -> StrategyDraftListResult:
        return StrategyDraftListResult(
            drafts=resolved_application.strategy_draft_service.remove(draft_id)
        )

    @app.post("/api/v1/analyses/positions", response_model=PositionAnalysisResult)
    async def analyze_positions(
        request: AnalyzePositionsRequest,
    ) -> PositionAnalysisResult:
        analysis = await resolved_application.position_analysis_service.analyze(
            request.legs,
            provider_id=request.provider,
            valuation_mode=request.valuation_mode,
            scenario_moves=request.scenario_moves,
        )
        return PositionAnalysisResult(analysis=analysis)

    @app.post("/api/v1/research/analyze", response_model=ManualResearchResult)
    def research_position(request: ManualResearchRequest) -> ManualResearchResult:
        return ManualResearchResult(analysis=analyze_manual_position(request))

    if frontend_available:
        app.mount(
            "/",
            StaticFiles(directory=resolved_static_dir, html=True),
            name="frontend",
        )

    return app


app = create_app()
