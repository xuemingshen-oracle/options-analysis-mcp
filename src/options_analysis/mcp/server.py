"""Local stdio MCP server exposing provider-neutral read-only tools."""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from mcp.server import MCPServer
from pydantic import Field

from options_analysis import __version__
from options_analysis.analytics.research import analyze_manual_position
from options_analysis.bootstrap import Application, build_application
from options_analysis.config import AppSettings
from options_analysis.domain import PositionRequestLeg, PutCall, ValuationMode
from options_analysis.domain.research import ManualResearchRequest
from options_analysis.mcp.errors import tool_error
from options_analysis.mcp.models import (
    ExpirationListResult,
    ExpirationSummary,
    ManualResearchResult,
    OptionChainResult,
    OptionQuoteListResult,
    PositionAnalysisResult,
    PriceHistoryResult,
    ProviderAuthStatusResult,
    ProviderListResult,
    ProviderSummary,
    QuoteResult,
    ServerInfoResult,
    TechnicalIndicatorListResult,
)
from options_analysis.providers import OptionChainQuery, PriceHistoryQuery
from options_analysis.providers.errors import ProviderError

SERVER_NAME = "options-analysis"


def create_server(settings: AppSettings | None = None) -> MCPServer:
    """Build an isolated server instance for stdio, embedding, or tests."""

    application = build_application(settings)
    server = MCPServer(
        SERVER_NAME,
        title="Provider-Pluggable Options Analysis",
        description="Read-only option position data and analysis foundation",
        instructions=(
            "Use provider-neutral options tools. This server is read-only and "
            "does not expose order or account-mutation capabilities."
        ),
        version=__version__,
    )
    _register_foundation_tools(server, application)
    return server


def _register_foundation_tools(server: MCPServer, application: Application) -> None:
    @server.tool(name="options_server_info")
    def options_server_info() -> ServerInfoResult:
        """Return safe server capabilities and runtime mode; never secrets."""

        public = application.settings.public_view()
        return ServerInfoResult(
            server_name=SERVER_NAME,
            version=__version__,
            environment=public.environment,
            transport="stdio",
            read_only=True,
            allow_live_smoke_tests=public.allow_live_smoke_tests,
            feature_groups=(
                "foundation",
                "market_data",
                "technical_analysis",
                "position_analysis",
                "manual_research",
            ),
        )

    @server.tool(name="options_list_technical_indicators")
    def options_list_technical_indicators() -> TechnicalIndicatorListResult:
        """List registered technical indicators and their specification syntax."""

        return TechnicalIndicatorListResult(
            indicators=application.technical_indicator_service.list_definitions()
        )

    @server.tool(name="options_list_providers")
    def options_list_providers() -> ProviderListResult:
        """List enabled provider capabilities and safe readiness information."""

        summaries = tuple(
            ProviderSummary(
                provider_id=status.descriptor.provider_id,
                display_name=status.descriptor.display_name,
                version=status.descriptor.version,
                authentication_type=status.descriptor.authentication_type.value,
                capabilities=tuple(
                    sorted(
                        capability.value
                        for capability in status.descriptor.capabilities
                    )
                ),
                freshness_modes=tuple(
                    sorted(mode.value for mode in status.descriptor.freshness_modes)
                ),
                configured=status.configured,
                ready=status.ready,
                message=status.message,
            )
            for status in application.provider_service.list_statuses()
        )
        return ProviderListResult(
            providers=summaries,
            defaults={
                "market_data": application.settings.default_market_data_provider,
            },
        )

    @server.tool(name="options_provider_auth_status")
    def options_provider_auth_status(
        provider: str,
    ) -> ProviderAuthStatusResult:
        """Return safe authentication state; never credentials or tokens."""

        try:
            status = application.provider_service.auth_status(provider)
        except ProviderError as error:
            return ProviderAuthStatusResult(error=tool_error(error))
        return ProviderAuthStatusResult(
            provider_id=status.provider_id,
            authentication_type=status.authentication_type.value,
            state=status.state.value,
            configured=status.configured,
            authorized=status.authorized,
            expires_at=(status.expires_at.isoformat() if status.expires_at else None),
            reauthorization_required=status.reauthorization_required,
            message=status.message,
        )

    @server.tool(name="options_get_underlying_quote")
    async def options_get_underlying_quote(
        symbol: str, provider: str | None = None
    ) -> QuoteResult:
        """Get one normalized stock, ETF, or index quote."""

        try:
            quote = await application.market_data_service.get_underlying_quote(
                symbol, provider
            )
        except (ProviderError, ValueError) as error:
            return QuoteResult(error=tool_error(error))
        return QuoteResult(quote=quote)

    @server.tool(name="options_get_option_expirations")
    async def options_get_option_expirations(
        underlying_symbol: str, provider: str | None = None
    ) -> ExpirationListResult:
        """List available option expirations for an underlying symbol."""

        try:
            expirations = await application.market_data_service.get_option_expirations(
                underlying_symbol, provider
            )
        except (ProviderError, ValueError) as error:
            return ExpirationListResult(error=tool_error(error))
        today = datetime.now(UTC).date()
        return ExpirationListResult(
            provider_id=(
                provider.strip().lower()
                if provider
                else application.settings.default_market_data_provider
            ),
            underlying_symbol=underlying_symbol.strip().upper(),
            expirations=tuple(
                ExpirationSummary(
                    expiration_date=expiration,
                    days_to_expiration=(expiration - today).days,
                )
                for expiration in expirations
            ),
        )

    @server.tool(name="options_get_option_chain")
    async def options_get_option_chain(
        underlying_symbol: str,
        provider: str | None = None,
        put_call: PutCall | None = None,
        expiration_from: date | None = None,
        expiration_to: date | None = None,
        strike_from: Decimal | None = None,
        strike_to: Decimal | None = None,
        limit: Annotated[int, Field(ge=1, le=100)] = 40,
    ) -> OptionChainResult:
        """Get a narrow normalized option chain with explicit filters."""

        try:
            query = OptionChainQuery(
                underlying_symbol=underlying_symbol,
                expiration_from=expiration_from,
                expiration_to=expiration_to,
                put_call=put_call,
                strike_from=strike_from,
                strike_to=strike_to,
                limit=limit,
            )
            chain = await application.market_data_service.get_option_chain(
                query, provider
            )
        except (ProviderError, ValueError) as error:
            return OptionChainResult(error=tool_error(error))
        return OptionChainResult(chain=chain)

    @server.tool(name="options_get_option_quotes")
    async def options_get_option_quotes(
        symbols: Annotated[tuple[str, ...], Field(min_length=1, max_length=100)],
        provider: str | None = None,
    ) -> OptionQuoteListResult:
        """Get normalized detailed quotes for selected option symbols."""

        try:
            quotes = await application.market_data_service.get_option_quotes(
                symbols, provider
            )
        except (ProviderError, ValueError) as error:
            return OptionQuoteListResult(error=tool_error(error))
        return OptionQuoteListResult(quotes=quotes)

    @server.tool(name="options_get_price_history")
    async def options_get_price_history(
        symbol: str,
        start: datetime,
        end: datetime,
        resolution: Literal["1m", "5m", "10m", "15m", "30m", "1d", "1w", "1mo"] = "1d",
        provider: str | None = None,
        indicators: Annotated[tuple[str, ...], Field(max_length=8)] = (),
    ) -> PriceHistoryResult:
        """Get price history and optional registered indicators such as sma:20."""

        try:
            query = PriceHistoryQuery(
                symbol=symbol, start=start, end=end, resolution=resolution
            )
            bars = await application.market_data_service.get_price_history(
                query, provider
            )
            indicator_series = application.technical_indicator_service.calculate(
                bars, indicators
            )
        except (ProviderError, ValueError) as error:
            return PriceHistoryResult(error=tool_error(error))
        return PriceHistoryResult(bars=bars, indicators=indicator_series)

    @server.tool(name="options_analyze_manual_position")
    def options_analyze_manual_position(
        request: ManualResearchRequest,
    ) -> ManualResearchResult:
        """Research standard stock/options without a provider.

        Quantities are signed, premiums per underlying unit, IV/rates decimals.
        Current marks are optional. Black-Scholes-Merton estimates omit early
        exercise and stop at the earliest expiry; they are not trade quotes.
        """
        try:
            return ManualResearchResult(analysis=analyze_manual_position(request))
        except ValueError as error:
            return ManualResearchResult(error=tool_error(error))

    @server.tool(name="options_analyze_positions")
    async def options_analyze_positions(
        legs: Annotated[
            tuple[PositionRequestLeg, ...], Field(min_length=1, max_length=100)
        ],
        provider: str | None = None,
        valuation_mode: ValuationMode = ValuationMode.MARK,
        scenario_moves: Annotated[
            tuple[Decimal, ...], Field(min_length=1, max_length=21)
        ] = (
            Decimal("-0.20"),
            Decimal("-0.10"),
            Decimal("0"),
            Decimal("0.10"),
            Decimal("0.20"),
        ),
    ) -> PositionAnalysisResult:
        """Enrich signed positions and calculate Greeks, payoff, and scenarios."""

        try:
            analysis = await application.position_analysis_service.analyze(
                legs,
                provider_id=provider,
                valuation_mode=valuation_mode,
                scenario_moves=scenario_moves,
            )
        except (ProviderError, ValueError) as error:
            return PositionAnalysisResult(error=tool_error(error))
        return PositionAnalysisResult(analysis=analysis)


mcp = create_server()


def main() -> None:
    """Run the local stdio transport."""

    mcp.run()


if __name__ == "__main__":
    main()
