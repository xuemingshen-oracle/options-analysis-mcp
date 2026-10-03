from decimal import Decimal

import pytest

from options_analysis.analytics import analyze_enriched_positions
from options_analysis.bootstrap import build_application
from options_analysis.config import AppSettings
from options_analysis.domain import (
    AssetType,
    DataQualityWarning,
    OptionGreeks,
    PositionRequestLeg,
    ValuationMode,
)
from options_analysis.providers.fake import FakeProvider
from options_analysis.services.analysis import PositionAnalysisService


def option_leg(
    symbol: str, quantity: str, open_price: str | None
) -> PositionRequestLeg:
    return PositionRequestLeg(
        symbol=symbol,
        asset_type=AssetType.OPTION,
        quantity=Decimal(quantity),
        average_open_price=(Decimal(open_price) if open_price is not None else None),
    )


def equity_leg(quantity: str, open_price: str) -> PositionRequestLeg:
    return PositionRequestLeg(
        symbol="SPY",
        asset_type=AssetType.ETF,
        quantity=Decimal(quantity),
        average_open_price=Decimal(open_price),
    )


@pytest.mark.asyncio
async def test_vertical_call_spread_matches_hand_calculation() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    result = await service.analyze(
        (
            option_leg("SPY300118C00095000", "1", "6"),
            option_leg("SPY300118C00100000", "-1", "3"),
        )
    )

    assert result.provider_id == "fake"
    assert result.net_cost_basis == Decimal("300")
    assert result.break_even_prices == (Decimal("98"),)
    assert result.max_profit == Decimal("200")
    assert result.max_profit_bounded is True
    assert result.max_loss == Decimal("-300")
    assert result.max_loss_bounded is True
    assert result.aggregate_greeks.delta.value == 0
    assert result.aggregate_greeks.gamma.value == 0
    assert all(point.estimated_profit_loss == 0 for point in result.scenarios)


@pytest.mark.asyncio
async def test_long_and_short_call_report_unbounded_side() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    long_call = await service.analyze((option_leg("SPY300118C00095000", "1", "6"),))
    short_call = await service.analyze((option_leg("SPY300118C00100000", "-1", "3"),))

    assert long_call.break_even_prices == (Decimal("101"),)
    assert long_call.max_profit is None
    assert long_call.max_profit_bounded is False
    assert long_call.max_loss == Decimal("-600")
    assert long_call.max_loss_bounded is True
    assert short_call.max_profit == Decimal("300")
    assert short_call.max_profit_bounded is True
    assert short_call.max_loss is None
    assert short_call.max_loss_bounded is False


@pytest.mark.asyncio
async def test_liquidation_mode_uses_bid_for_long_and_ask_for_short() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    result = await service.analyze(
        (
            option_leg("SPY300118C00095000", "1", None),
            option_leg("SPY300118C00100000", "-1", None),
        ),
        valuation_mode=ValuationMode.LIQUIDATION,
    )

    assert result.net_market_value == Decimal("290")
    assert result.net_cost_basis is None
    assert result.break_even_prices == ()
    assert {warning.code for warning in result.warnings} >= {"missing_cost_basis"}


@pytest.mark.asyncio
async def test_calendar_position_omits_exact_expiration_payoff() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    result = await service.analyze(
        (
            option_leg("SPY300118C00100000", "1", "5"),
            option_leg("SPY300215C00100000", "-1", "4"),
        )
    )

    assert result.expiration_date is None
    assert result.payoff_points == ()
    assert "multiple_expirations" in {warning.code for warning in result.warnings}


@pytest.mark.asyncio
async def test_scenario_moves_are_bounded() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    with pytest.raises(ValueError, match="greater than -1"):
        await service.analyze(
            (option_leg("SPY300118C00100000", "1", "5"),),
            scenario_moves=(Decimal("-1"),),
        )


@pytest.mark.asyncio
async def test_zero_liquidation_bid_is_not_replaced_by_mark() -> None:
    quote = (await FakeProvider().get_option_quotes(("SPY300118C00100000",)))[0]
    zero_bid = quote.model_copy(update={"bid": Decimal("0")})

    price = PositionAnalysisService._valuation_price(
        zero_bid, Decimal("1"), ValuationMode.LIQUIDATION
    )

    assert price == 0


@pytest.mark.asyncio
async def test_multiple_underlyings_do_not_produce_one_factor_scenarios() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service
    legs = (
        PositionRequestLeg(
            symbol="SPY",
            asset_type=AssetType.ETF,
            quantity=Decimal("10"),
            average_open_price=Decimal("90"),
        ),
        PositionRequestLeg(
            symbol="AAPL",
            asset_type=AssetType.EQUITY,
            quantity=Decimal("5"),
            average_open_price=Decimal("80"),
        ),
    )

    result = await service.analyze(legs)

    assert result.underlying_symbol is None
    assert result.underlying_price is None
    assert result.scenarios == ()
    assert "multiple_underlyings" in {warning.code for warning in result.warnings}


@pytest.mark.asyncio
async def test_iron_condor_matches_hand_calculated_credit_and_bounds() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    result = await service.analyze(
        (
            option_leg("SPY300118P00090000", "1", "0.5"),
            option_leg("SPY300118P00095000", "-1", "2"),
            option_leg("SPY300118C00105000", "-1", "2"),
            option_leg("SPY300118C00110000", "1", "0.5"),
        )
    )

    assert result.net_cost_basis == Decimal("-300.0")
    assert result.break_even_prices == (Decimal("92.0"), Decimal("108.0"))
    assert result.max_profit == Decimal("300.0")
    assert result.max_profit_bounded is True
    assert result.max_loss == Decimal("-200.0")
    assert result.max_loss_bounded is True


@pytest.mark.asyncio
async def test_protective_put_and_collar_match_hand_calculated_bounds() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    protective_put = await service.analyze(
        (
            equity_leg("100", "100"),
            option_leg("SPY300118P00095000", "1", "2"),
        )
    )
    collar = await service.analyze(
        (
            equity_leg("100", "100"),
            option_leg("SPY300118P00095000", "1", "2"),
            option_leg("SPY300118C00105000", "-1", "2"),
        )
    )

    assert protective_put.net_cost_basis == Decimal("10200")
    assert protective_put.break_even_prices == (Decimal("102"),)
    assert protective_put.max_profit_bounded is False
    assert protective_put.max_loss == Decimal("-700")
    assert protective_put.max_loss_bounded is True
    assert collar.net_cost_basis == Decimal("10000")
    assert collar.break_even_prices == (Decimal("100"),)
    assert collar.max_profit == Decimal("500")
    assert collar.max_loss == Decimal("-500")


@pytest.mark.asyncio
async def test_cash_secured_put_matches_hand_calculated_bounds() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    result = await service.analyze((option_leg("SPY300118P00095000", "-1", "2"),))

    assert result.net_cost_basis == Decimal("-200")
    assert result.break_even_prices == (Decimal("93"),)
    assert result.max_profit == Decimal("200")
    assert result.max_profit_bounded is True
    assert result.max_loss == Decimal("-9300")
    assert result.max_loss_bounded is True


@pytest.mark.asyncio
async def test_straddle_and_strangle_match_hand_calculated_payoffs() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    straddle = await service.analyze(
        (
            option_leg("SPY300118C00100000", "1", "4"),
            option_leg("SPY300118P00100000", "1", "4"),
        )
    )
    strangle = await service.analyze(
        (
            option_leg("SPY300118P00095000", "1", "2"),
            option_leg("SPY300118C00105000", "1", "2"),
        )
    )

    assert straddle.net_cost_basis == Decimal("800")
    assert straddle.break_even_prices == (Decimal("92"), Decimal("108"))
    assert straddle.max_profit_bounded is False
    assert straddle.max_loss == Decimal("-800")
    assert strangle.net_cost_basis == Decimal("400")
    assert strangle.break_even_prices == (Decimal("91"), Decimal("109"))
    assert strangle.max_profit_bounded is False
    assert strangle.max_loss == Decimal("-400")


@pytest.mark.asyncio
async def test_quote_warnings_are_visible_in_combined_analysis() -> None:
    quote = (await FakeProvider().get_option_quotes(("SPY300118C00100000",)))[0]
    quote = quote.model_copy(
        update={
            "warnings": (
                DataQualityWarning(
                    code="stale_quote", message="The quote is stale.", fields=("as_of",)
                ),
            )
        }
    )
    leg = PositionAnalysisService._enrich(
        option_leg(quote.instrument.symbol, "1", "5"), quote, ValuationMode.MARK
    )

    result = analyze_enriched_positions(
        (leg,),
        provider_id="fake",
        valuation_mode=ValuationMode.MARK,
        scenario_moves=(Decimal("0"),),
    )

    warning = next(item for item in result.warnings if item.code == "stale_quote")
    assert quote.instrument.symbol in warning.message
    assert warning.fields == ("positions[0].current_quote.as_of",)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "terms_update",
    [{"is_adjusted": True}, {"deliverables": ("50 SPY shares plus cash",)}],
)
async def test_nonstandard_terms_do_not_receive_standard_intrinsic_payoff(
    terms_update: dict[str, object],
) -> None:
    quote = (await FakeProvider().get_option_quotes(("SPY300118C00100000",)))[0]
    assert quote.instrument.option is not None
    instrument = quote.instrument.model_copy(
        update={"option": quote.instrument.option.model_copy(update=terms_update)}
    )
    quote = quote.model_copy(update={"instrument": instrument})
    leg = PositionAnalysisService._enrich(
        option_leg(instrument.symbol, "1", "5"), quote, ValuationMode.MARK
    )

    result = analyze_enriched_positions(
        (leg,),
        provider_id="fake",
        valuation_mode=ValuationMode.MARK,
        scenario_moves=(Decimal("0"),),
    )

    assert result.payoff_points == ()
    assert result.break_even_prices == ()
    assert result.max_profit_bounded is None
    assert result.max_loss_bounded is None
    assert "unsupported_payoff_terms" in {item.code for item in result.warnings}


@pytest.mark.asyncio
@pytest.mark.parametrize("quantity,side", [("1", "bid"), ("-1", "ask")])
async def test_missing_liquidation_side_discloses_fallback(
    quantity: str,
    side: str,
) -> None:
    quote = (await FakeProvider().get_option_quotes(("SPY300118C00100000",)))[0]
    quote = quote.model_copy(update={side: None, "mark": Decimal("2.75")})
    leg = PositionAnalysisService._enrich(
        option_leg(quote.instrument.symbol, quantity, "5"),
        quote,
        ValuationMode.LIQUIDATION,
    )

    result = analyze_enriched_positions(
        (leg,),
        provider_id="fake",
        valuation_mode=ValuationMode.LIQUIDATION,
        scenario_moves=(Decimal("0"),),
    )

    assert result.net_market_value == Decimal(quantity) * Decimal("275")
    warning = next(
        item for item in result.warnings if item.code == "liquidation_price_unavailable"
    )
    assert f"Liquidation {side} is unavailable" in warning.message
    assert "mark as a fallback estimate" in warning.message
    # Enrichment must not mutate cached provider quotes.
    assert not quote.warnings


@pytest.mark.asyncio
async def test_partial_greeks_suppress_price_scenario_estimate() -> None:
    quote = (await FakeProvider().get_option_quotes(("SPY300118C00100000",)))[0]
    quote = quote.model_copy(update={"greeks": OptionGreeks(delta=Decimal("0.5"))})
    leg = PositionAnalysisService._enrich(
        option_leg(quote.instrument.symbol, "1", "5"), quote, ValuationMode.MARK
    )

    result = analyze_enriched_positions(
        (leg,),
        provider_id="fake",
        valuation_mode=ValuationMode.MARK,
        scenario_moves=(Decimal("0.10"),),
    )

    assert result.aggregate_greeks.delta.complete is True
    assert result.aggregate_greeks.gamma.complete is False
    assert result.scenarios[0].estimated_profit_loss is None
    warning = next(item for item in result.warnings if item.code == "incomplete_greeks")
    assert "partial sums" in warning.message


@pytest.mark.asyncio
async def test_scenario_change_is_dollars_and_estimate_is_change_from_today() -> None:
    quote = (await FakeProvider().get_option_quotes(("SPY300118C00100000",)))[0]
    quote = quote.model_copy(
        update={
            "underlying_price": Decimal("200"),
            "greeks": OptionGreeks(delta=Decimal("0.5"), gamma=Decimal("0.01")),
        }
    )
    leg = PositionAnalysisService._enrich(
        option_leg(quote.instrument.symbol, "1", "8"), quote, ValuationMode.MARK
    )

    result = analyze_enriched_positions(
        (leg,),
        provider_id="fake",
        valuation_mode=ValuationMode.MARK,
        scenario_moves=(Decimal("0"), Decimal("0.10")),
    )

    assert result.scenarios[0].estimated_profit_loss == 0
    assert result.scenarios[1].underlying_change == Decimal("20")
    assert result.scenarios[1].underlying_price == Decimal("220")
    # 50 shares delta * $20 + (1 gamma * $20²) / 2.
    assert result.scenarios[1].estimated_profit_loss == Decimal("1200")


@pytest.mark.asyncio
async def test_payoff_chart_includes_the_tail_beyond_the_highest_strike() -> None:
    service = build_application(AppSettings(_env_file=None)).position_analysis_service

    result = await service.analyze((option_leg("SPY300118C00500000", "1", "5"),))

    assert result.payoff_points[-1].underlying_price > Decimal("500")
    assert result.payoff_points[-1].position_value > 0
