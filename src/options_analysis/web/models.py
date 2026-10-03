"""Provider-neutral HTTP response models."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from options_analysis.config import EnvironmentName
from options_analysis.domain import (
    OptionChain,
    PositionAnalysis,
    PositionRequestLeg,
    PriceBar,
    Quote,
    StrategyDraft,
    StrategyTemplate,
    TechnicalIndicatorDefinition,
    TechnicalIndicatorSeries,
    ValuationMode,
    WatchlistItem,
)
from options_analysis.domain.research import ManualResearchAnalysis
from options_analysis.errors import ErrorDetail


class WebModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ServerInfo(WebModel):
    name: str
    version: str
    environment: EnvironmentName
    read_only: bool
    default_market_data_provider: str
    frontend_available: bool


class ServerInfoResult(WebModel):
    info: ServerInfo | None = None
    error: ErrorDetail | None = None


class ProviderSummary(WebModel):
    provider_id: str
    display_name: str
    capabilities: tuple[str, ...]
    freshness_modes: tuple[str, ...]
    configured: bool
    ready: bool
    message: str | None


class ProviderListResult(WebModel):
    providers: tuple[ProviderSummary, ...] = ()
    default_market_data_provider: str | None = None
    error: ErrorDetail | None = None


class WorkspaceSnapshot(WebModel):
    provider_id: str
    symbol: str
    quote: Quote
    expirations: tuple[date, ...]
    chain: OptionChain


class WorkspaceResult(WebModel):
    workspace: WorkspaceSnapshot | None = None
    error: ErrorDetail | None = None


class PriceHistorySnapshot(WebModel):
    provider_id: str
    symbol: str
    resolution: str
    start: datetime
    end: datetime
    bars: tuple[PriceBar, ...] = Field(max_length=500)
    indicators: tuple[TechnicalIndicatorSeries, ...] = Field(default=(), max_length=8)
    truncated: bool = False


class PriceHistoryResult(WebModel):
    history: PriceHistorySnapshot | None = None
    error: ErrorDetail | None = None


class TechnicalIndicatorCatalogResult(WebModel):
    indicators: tuple[TechnicalIndicatorDefinition, ...] = ()
    error: ErrorDetail | None = None


class AddWatchlistItemRequest(WebModel):
    symbol: str


class WatchlistResult(WebModel):
    items: tuple[WatchlistItem, ...] = ()
    error: ErrorDetail | None = None


class StrategyCatalogResult(WebModel):
    strategies: tuple[StrategyTemplate, ...] = ()
    error: ErrorDetail | None = None


class StrategyDraftResult(WebModel):
    draft: StrategyDraft | None = None
    error: ErrorDetail | None = None


class StrategyDraftListResult(WebModel):
    drafts: tuple[StrategyDraft, ...] = ()
    error: ErrorDetail | None = None


class AnalyzePositionsRequest(WebModel):
    legs: tuple[PositionRequestLeg, ...] = Field(min_length=1, max_length=100)
    provider: str | None = None
    valuation_mode: ValuationMode = ValuationMode.MARK
    scenario_moves: tuple[Decimal, ...] = (
        Decimal("-0.20"),
        Decimal("-0.10"),
        Decimal("0"),
        Decimal("0.10"),
        Decimal("0.20"),
    )


class PositionAnalysisResult(WebModel):
    analysis: PositionAnalysis | None = None
    error: ErrorDetail | None = None


class ManualResearchResult(WebModel):
    analysis: ManualResearchAnalysis | None = None
    error: ErrorDetail | None = None
