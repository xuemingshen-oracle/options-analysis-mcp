"""Structured, secret-safe MCP results."""

from datetime import date

from pydantic import BaseModel, ConfigDict

from options_analysis.config import EnvironmentName
from options_analysis.domain import (
    OptionChain,
    PositionAnalysis,
    PriceBar,
    Quote,
    TechnicalIndicatorDefinition,
    TechnicalIndicatorSeries,
)
from options_analysis.domain.research import ManualResearchAnalysis
from options_analysis.errors import ErrorDetail


class _StrictResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


ToolErrorDetail = ErrorDetail


class MCPResult(_StrictResultModel):
    error: ToolErrorDetail | None = None


class ServerInfoResult(MCPResult):
    server_name: str
    version: str
    environment: EnvironmentName
    transport: str
    read_only: bool
    allow_live_smoke_tests: bool
    feature_groups: tuple[str, ...]


class ProviderSummary(MCPResult):
    provider_id: str
    display_name: str
    version: str
    authentication_type: str
    capabilities: tuple[str, ...]
    freshness_modes: tuple[str, ...]
    configured: bool
    ready: bool
    message: str | None


class ProviderListResult(MCPResult):
    providers: tuple[ProviderSummary, ...]
    defaults: dict[str, str]


class ProviderAuthStatusResult(MCPResult):
    provider_id: str | None = None
    authentication_type: str | None = None
    state: str | None = None
    configured: bool | None = None
    authorized: bool | None = None
    expires_at: str | None = None
    reauthorization_required: bool | None = None
    message: str | None = None


class QuoteResult(MCPResult):
    quote: Quote | None = None


class ExpirationSummary(MCPResult):
    expiration_date: date
    days_to_expiration: int


class ExpirationListResult(MCPResult):
    provider_id: str | None = None
    underlying_symbol: str | None = None
    expirations: tuple[ExpirationSummary, ...] = ()


class OptionChainResult(MCPResult):
    chain: OptionChain | None = None


class OptionQuoteListResult(MCPResult):
    quotes: tuple[Quote, ...] = ()


class PriceHistoryResult(MCPResult):
    bars: tuple[PriceBar, ...] = ()
    indicators: tuple[TechnicalIndicatorSeries, ...] = ()


class TechnicalIndicatorListResult(MCPResult):
    indicators: tuple[TechnicalIndicatorDefinition, ...] = ()


class PositionAnalysisResult(MCPResult):
    analysis: PositionAnalysis | None = None


class ManualResearchResult(MCPResult):
    analysis: ManualResearchAnalysis | None = None
