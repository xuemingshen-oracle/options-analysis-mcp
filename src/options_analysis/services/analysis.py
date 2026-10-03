"""Position enrichment orchestration over provider-neutral market data."""

from decimal import Decimal

from options_analysis.analytics import analyze_enriched_positions
from options_analysis.domain import (
    AssetType,
    DataQualityWarning,
    PositionAnalysis,
    PositionLeg,
    PositionRequestLeg,
    Quote,
    ValuationMode,
)
from options_analysis.services.market_data import MarketDataService

DEFAULT_SCENARIO_MOVES = (
    Decimal("-0.20"),
    Decimal("-0.10"),
    Decimal("0"),
    Decimal("0.10"),
    Decimal("0.20"),
)


class PositionAnalysisService:
    def __init__(self, market_data: MarketDataService) -> None:
        self._market_data = market_data

    async def analyze(
        self,
        legs: tuple[PositionRequestLeg, ...],
        *,
        provider_id: str | None = None,
        valuation_mode: ValuationMode = ValuationMode.MARK,
        scenario_moves: tuple[Decimal, ...] = DEFAULT_SCENARIO_MOVES,
    ) -> PositionAnalysis:
        if not legs:
            raise ValueError("at least one position leg is required")
        if len(legs) > 100:
            raise ValueError("at most 100 position legs may be analyzed")
        moves = self._validate_moves(scenario_moves)

        option_legs = tuple(leg for leg in legs if leg.asset_type is AssetType.OPTION)
        option_quotes = (
            await self._market_data.get_option_quotes(
                tuple(leg.symbol for leg in option_legs), provider_id
            )
            if option_legs
            else ()
        )
        option_by_symbol = {
            self._compact(quote.instrument.provider_symbol): quote
            for quote in option_quotes
        }

        enriched: list[PositionLeg] = []
        for request in legs:
            if request.asset_type is AssetType.OPTION:
                quote = option_by_symbol.get(self._compact(request.symbol))
                if quote is None:
                    raise ValueError(
                        f"provider omitted option quote {request.symbol!r}"
                    )
            else:
                quote = await self._market_data.get_underlying_quote(
                    request.symbol, provider_id
                )
            enriched.append(self._enrich(request, quote, valuation_mode))

        provider_ids = {item.instrument.provider_id for item in enriched}
        if len(provider_ids) != 1:
            raise ValueError("one analysis cannot silently mix market-data providers")
        return analyze_enriched_positions(
            tuple(enriched),
            provider_id=next(iter(provider_ids)),
            valuation_mode=valuation_mode,
            scenario_moves=moves,
        )

    @staticmethod
    def _enrich(
        request: PositionRequestLeg, quote: Quote, mode: ValuationMode
    ) -> PositionLeg:
        if request.asset_type is AssetType.OPTION:
            if quote.instrument.asset_type is not AssetType.OPTION:
                raise ValueError(f"{request.symbol!r} did not resolve to an option")
        elif quote.instrument.asset_type not in {AssetType.EQUITY, AssetType.ETF}:
            raise ValueError(f"{request.symbol!r} did not resolve to equity or ETF")
        price = PositionAnalysisService._valuation_price(quote, request.quantity, mode)
        if mode is ValuationMode.LIQUIDATION:
            side = "bid" if request.quantity > 0 else "ask"
            if getattr(quote, side) is None:
                source = (
                    "mark"
                    if quote.mark is not None
                    else "last trade"
                    if quote.last is not None
                    else None
                )
                message = (
                    f"Liquidation {side} is unavailable. Current value uses the "
                    f"{source} as a fallback estimate, not an executable close price."
                    if source is not None
                    else f"Liquidation {side} and fallback prices are unavailable; "
                    "current value cannot be estimated."
                )
                quote = quote.model_copy(
                    update={
                        "warnings": (
                            *quote.warnings,
                            DataQualityWarning(
                                code="liquidation_price_unavailable",
                                message=message,
                                fields=(side,),
                            ),
                        )
                    }
                )
        multiplier = (
            quote.instrument.option.multiplier
            if quote.instrument.option is not None
            else Decimal("1")
        )
        market_value = (
            price * request.quantity * multiplier if price is not None else None
        )
        cost_basis = (
            request.average_open_price * request.quantity * multiplier
            if request.average_open_price is not None
            else None
        )
        return PositionLeg(
            instrument=quote.instrument,
            quantity=request.quantity,
            average_open_price=request.average_open_price,
            current_quote=quote,
            market_value=market_value,
            cost_basis=cost_basis,
            unrealized_profit_loss=(
                market_value - cost_basis
                if market_value is not None and cost_basis is not None
                else None
            ),
            source="user_input",
            as_of=quote.as_of,
        )

    @staticmethod
    def _valuation_price(
        quote: Quote, quantity: Decimal, mode: ValuationMode
    ) -> Decimal | None:
        midpoint = (
            (quote.bid + quote.ask) / Decimal("2")
            if quote.bid is not None and quote.ask is not None
            else None
        )
        if mode is ValuationMode.LIQUIDATION:
            primary = quote.bid if quantity > 0 else quote.ask
            return PositionAnalysisService._first_price(
                primary, quote.mark, midpoint, quote.last
            )
        if mode is ValuationMode.MIDPOINT:
            return PositionAnalysisService._first_price(
                midpoint, quote.mark, quote.last
            )
        return PositionAnalysisService._first_price(quote.mark, midpoint, quote.last)

    @staticmethod
    def _first_price(*values: Decimal | None) -> Decimal | None:
        return next((value for value in values if value is not None), None)

    @staticmethod
    def _validate_moves(values: tuple[Decimal, ...]) -> tuple[Decimal, ...]:
        if not values:
            raise ValueError("at least one scenario move is required")
        if len(values) > 21:
            raise ValueError("at most 21 scenario moves may be requested")
        unique = tuple(sorted(set(values)))
        if any(value <= Decimal("-1") or value > Decimal("5") for value in unique):
            raise ValueError("scenario moves must be greater than -1 and at most 5")
        return unique

    @staticmethod
    def _compact(symbol: str) -> str:
        return symbol.replace(" ", "").upper()
