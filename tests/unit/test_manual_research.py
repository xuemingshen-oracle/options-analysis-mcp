"""Independent identities and hand-calculated position research regressions."""

from datetime import date
from decimal import Decimal
from math import exp
from typing import Any

import pytest
from pydantic import ValidationError

from options_analysis.analytics.pricing import (
    european_option,
    implied_volatility_from_price,
)
from options_analysis.analytics.research import analyze_manual_position
from options_analysis.domain.research import ManualResearchRequest


def option(
    kind: str = "call",
    quantity: int = 1,
    strike: int = 100,
    entry: float = 5,
    **kwargs: Any,
) -> dict[str, Any]:
    return dict(
        kind=kind,
        quantity=quantity,
        strike=strike,
        entry_price=entry,
        expiration="2026-11-01",
        **kwargs,
    )


def request(*legs: dict[str, Any], **kwargs: Any) -> ManualResearchRequest:
    return ManualResearchRequest.model_validate(
        dict(
            symbol="TEST",
            spot=100,
            valuation_date="2026-10-02",
            legs=legs,
            **kwargs,
        )
    )


@pytest.mark.parametrize("spot", [0, 60, 100, 160])
@pytest.mark.parametrize("years", [0, 1 / 365, 1, 10])
@pytest.mark.parametrize("vol", [0, 0.2, 5])
def test_put_call_parity_for_prices_and_greeks(
    spot: float, years: float, vol: float
) -> None:
    rate, yield_ = 0.045, 0.015
    call = european_option("call", spot, 100, years, vol, rate, yield_)
    put = european_option("put", spot, 100, years, vol, rate, yield_)
    assert call.price - put.price == pytest.approx(
        spot * exp(-yield_ * years) - 100 * exp(-rate * years),
        abs=1e-10,
    )
    assert call.delta - put.delta == pytest.approx(exp(-yield_ * years))
    assert call.gamma == put.gamma
    assert call.vega == put.vega
    if years > 0:
        assert call.rho - put.rho == pytest.approx(
            100 * years * exp(-rate * years) / 100
        )


def test_reference_black_scholes_price_and_finite_difference_greeks() -> None:
    actual = european_option("call", 100, 100, 1, 0.2, 0.05)
    assert actual.price == pytest.approx(10.450583572, abs=1e-8)
    step = 0.001
    up = european_option("call", 100 + step, 100, 1, 0.2, 0.05)
    down = european_option("call", 100 - step, 100, 1, 0.2, 0.05)
    assert actual.delta == pytest.approx((up.price - down.price) / (2 * step), rel=1e-7)
    assert actual.gamma == pytest.approx(
        (up.price - 2 * actual.price + down.price) / step**2, rel=1e-5
    )
    iv_up = european_option("call", 100, 100, 1, 0.2 + step, 0.05)
    iv_down = european_option("call", 100, 100, 1, 0.2 - step, 0.05)
    assert actual.vega == pytest.approx(
        (iv_up.price - iv_down.price) / (2 * step * 100), rel=1e-5
    )
    tomorrow = european_option("call", 100, 100, 1 - step, 0.2, 0.05)
    yesterday = european_option("call", 100, 100, 1 + step, 0.2, 0.05)
    assert actual.theta == pytest.approx(
        (tomorrow.price - yesterday.price) / (2 * step * 365), rel=1e-5
    )


def test_vertical_fees_break_even_sizing_and_exact_expiry() -> None:
    result = analyze_manual_position(
        request(
            option(strike=95, entry=6),
            option(quantity=-1, strike=100, entry=3),
            fee_per_contract="0.65",
            fixed_fees="1.4",
            risk_budget=1000,
            horizon_days=30,
        )
    )
    assert result.total_fees == 4
    assert result.net_entry_value == 300
    assert result.max_profit == 196
    assert result.max_loss == -304
    assert result.break_even_prices == (Decimal("98.04"),)
    assert result.sizing.max_position_units == 3
    assert result.sizing.fits_budget is True
    assert result.payoff_points == result.horizon_points
    assert result.reward_risk_ratio is not None
    assert abs(result.reward_risk_ratio - Decimal(196) / 304) < Decimal("1e-27")


def test_credit_condor_and_multiplier_scaling() -> None:
    legs = (
        option("put", 1, 90, 0.5),
        option("put", -1, 95, 2),
        option("call", -1, 105, 2),
        option("call", 1, 110, 0.5),
    )
    result = analyze_manual_position(request(*legs))
    assert result.net_entry_value == -300
    assert result.max_profit == 300
    assert result.max_loss == -200
    assert result.break_even_prices == (Decimal(92), Decimal(108))
    small = analyze_manual_position(
        request(*(dict(leg, multiplier=10) for leg in legs))
    )
    assert small.net_entry_value == -30
    assert small.max_loss == -20
    assert small.break_even_prices == result.break_even_prices


@pytest.mark.parametrize(
    ("legs", "profit", "loss", "roots"),
    [
        ((option(),), None, -500, (105,)),
        ((option(quantity=-1),), 500, None, (105,)),
        ((option("put", -1, 95, 2),), 200, -9300, (93,)),
        (
            (
                {"kind": "stock", "quantity": 100, "entry_price": 100},
                option("put", 1, 95, 2),
            ),
            None,
            -700,
            (102,),
        ),
        (
            (
                {"kind": "stock", "quantity": 100, "entry_price": 100},
                option("call", -1, 105, 2),
            ),
            700,
            -9800,
            (98,),
        ),
        (({"kind": "stock", "quantity": -10, "entry_price": 90},), 900, None, (90,)),
    ],
)
def test_known_strategy_terminal_risks(
    legs: tuple[dict[str, Any], ...],
    profit: int | None,
    loss: int | None,
    roots: tuple[int, ...],
) -> None:
    result = analyze_manual_position(request(*legs))
    assert result.max_profit == profit
    assert result.max_loss == loss
    assert result.break_even_prices == tuple(Decimal(value) for value in roots)
    assert result.max_profit_bounded is (profit is not None)
    assert result.max_loss_bounded is (loss is not None)


def test_calendar_caps_dates_preserves_later_time_value_and_omits_false_bounds() -> (
    None
):
    later = dict(option(), expiration="2026-12-01")
    result = analyze_manual_position(
        request(option(quantity=-1), later, horizon_days=120)
    )
    assert result.horizon_days == 30
    assert result.horizon_date == date(2026, 11, 1)
    assert result.expiration_date is None
    assert result.payoff_points == ()
    assert result.max_loss is None and result.max_loss_bounded is None
    assert all(point.horizon_days <= 30 for point in result.timeline)
    assert (
        next(point for point in result.scenarios if point.move == 0).position_value > 0
    )
    assert {item.code for item in result.findings} >= {
        "horizon_capped",
        "multiple_expirations",
    }


def test_scenario_entry_and_today_bases_do_not_double_count_credit() -> None:
    result = analyze_manual_position(
        request(
            option("put", -1, 95, 2, current_price=3), horizon_days=30, fixed_fees=10
        )
    )
    unchanged = next(point for point in result.scenarios if point.move == 0)
    assert result.current_value == -300
    assert result.current_profit_loss == -110
    assert unchanged.position_value == 0
    assert unchanged.profit_loss == 190
    assert unchanged.change_from_today == 300
    assert result.leg_breakdown[0].entry_value == -200
    assert result.leg_breakdown[0].profit_loss == -100


def test_day_zero_model_baseline_and_iv_shift_units() -> None:
    base = analyze_manual_position(request(option(), horizon_days=0))
    unchanged = next(point for point in base.scenarios if point.move == 0)
    assert unchanged.change_from_today == 0
    higher = analyze_manual_position(request(option(), horizon_days=0, iv_shift="0.05"))
    higher_unchanged = next(point for point in higher.scenarios if point.move == 0)
    assert higher_unchanged.change_from_today > 0
    assert higher.modeled_greeks == base.modeled_greeks


def test_large_downside_scenario_is_zero_spot_and_finite() -> None:
    result = analyze_manual_position(request(option("put"), scenario_moves=(-1, 5)))
    assert result.scenarios[0].underlying_price == 0
    assert result.scenarios[0].position_value.is_finite()
    assert result.scenarios[1].underlying_price == 600
    assert result.horizon_points[-1].underlying_price >= 600


def test_chart_focuses_near_position_not_zero_and_preserves_strike_knots() -> None:
    result = analyze_manual_position(
        request(option(strike=95), option(quantity=-1, strike=105))
    )
    prices = {point.underlying_price for point in result.payoff_points}
    assert 0 not in prices
    assert prices >= {Decimal(95), Decimal(100), Decimal(105)}


@pytest.mark.parametrize("vol", [0.0, 0.2, 0.73, 5.0])
@pytest.mark.parametrize("kind", ["call", "put"])
def test_implied_volatility_round_trip(kind: Any, vol: float) -> None:
    price = european_option(kind, 100, 95, 0.25, vol, 0.04, 0.015).price
    actual = implied_volatility_from_price(kind, 100, 95, 0.25, price, 0.04, 0.015)
    assert actual == pytest.approx(vol, abs=1e-8)


def test_calibration_matches_entered_marks_without_replacing_input_iv() -> None:
    price = european_option("call", 100, 100, 30 / 365, 0.57).price
    data = request(
        option(current_price=price), horizon_days=0, calibrate_iv_from_marks=True
    )
    result = analyze_manual_position(data)
    unchanged = next(point for point in result.scenarios if point.move == 0)
    assert abs(unchanged.change_from_today) < Decimal("0.000001")
    assert float(result.leg_breakdown[0].implied_volatility) == pytest.approx(0.57)
    assert result.leg_breakdown[0].input_implied_volatility == Decimal("0.30")
    assert result.leg_breakdown[0].iv_source == "calibrated"
    assert data.legs[0].implied_volatility == Decimal("0.30")


def test_impossible_calibration_is_visible_and_preserves_entered_iv() -> None:
    result = analyze_manual_position(
        request(option(current_price=500), calibrate_iv_from_marks=True)
    )
    assert result.leg_breakdown[0].iv_source == "entered"
    assert result.leg_breakdown[0].current_price == 500
    assert {finding.code for finding in result.findings} >= {
        "iv_calibration_failed_0",
        "mark_model_divergence",
    }


def test_calibrated_negative_shift_is_rejected_instead_of_clamped() -> None:
    data = request(
        option(current_price=0), calibrate_iv_from_marks=True, iv_shift="-0.1"
    )
    # ATM call at positive rates cannot have a zero mark; failed calibration
    # retains 30% IV, so 30%-10%=20% remains valid and emits a finding.
    result = analyze_manual_position(data)
    assert "iv_calibration_failed_0" in {finding.code for finding in result.findings}
    valid_low_mark = european_option("call", 100, 100, 30 / 365, 0.05).price
    with pytest.raises(ValueError, match="effective shifted IV"):
        analyze_manual_position(
            request(
                option(current_price=valid_low_mark),
                calibrate_iv_from_marks=True,
                iv_shift="-0.1",
            )
        )


@pytest.mark.parametrize(
    "updates",
    [
        {"spot": "NaN"},
        {"spot": "Infinity"},
        {"spot": 0},
        {"spot": "1e-1000"},
        {"scenario_moves": ["NaN"]},
        {"scenario_moves": [-1.01]},
        {"iv_shift": -0.31},
        {"risk_budget": 0},
        {"horizon_days": 3651},
        {"scenario_days": [-1]},
    ],
)
def test_invalid_analysis_inputs_fail_at_boundary(updates: dict[str, Any]) -> None:
    payload = dict(spot=100, valuation_date="2026-10-02", legs=[option()])
    payload.update(updates)
    with pytest.raises(ValidationError):
        ManualResearchRequest.model_validate(payload)


@pytest.mark.parametrize(
    "updates",
    [
        {"quantity": 0},
        {"quantity": 1.5},
        {"quantity": "NaN"},
        {"strike": None},
        {"strike": 0},
        {"strike": "1e-1000"},
        {"expiration": "2026-10-01"},
        {"expiration": "2050-01-01"},
        {"entry_price": -1},
        {"implied_volatility": "0.0000001"},
        {"implied_volatility": "Infinity"},
        {"multiplier": 0},
        {"entry_price": "0e-100000000"},
        {"current_price": "1e-100000000"},
    ],
)
def test_invalid_leg_inputs_fail_at_boundary(updates: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        request(dict(option(), **updates))


def test_stock_date_overflow_is_validation_error() -> None:
    with pytest.raises(ValidationError, match="supported calendar"):
        ManualResearchRequest.model_validate(
            dict(
                spot=100,
                valuation_date="9999-12-31",
                legs=[{"kind": "stock", "quantity": 1, "entry_price": 100}],
            )
        )


def test_budget_unbounded_zero_risk_and_flat_payoff_are_explicit() -> None:
    unbounded = analyze_manual_position(request(option(quantity=-1), risk_budget=1000))
    assert unbounded.sizing.risk_per_position is None
    assert unbounded.sizing.max_position_units is None
    assert {finding.code for finding in unbounded.findings} >= {
        "unbounded_loss",
        "budget_unavailable",
    }
    flat = analyze_manual_position(
        request(option(), option(quantity=-1), risk_budget=1000)
    )
    assert flat.sizing.risk_per_position == 0
    assert flat.sizing.max_position_units is None
    assert "flat_break_even" in {finding.code for finding in flat.findings}


def test_horizon_greeks_match_price_derivatives_after_time_and_iv_shift() -> None:
    result = analyze_manual_position(
        request(
            option(strike=95),
            option(quantity=-2, strike=100),
            option(strike=105),
            {"kind": "stock", "quantity": 7, "entry_price": 100},
            horizon_days=7,
            iv_shift="0.03",
            scenario_moves=["-0.0001", "0", "0.0001"],
        )
    )
    down, center, up = result.scenarios
    bump = float(up.underlying_price - center.underlying_price)
    numerical_delta = float(up.position_value - down.position_value) / (2 * bump)
    numerical_gamma = (
        float(up.position_value - 2 * center.position_value + down.position_value)
        / bump**2
    )
    assert float(center.modeled_greeks.delta) == pytest.approx(
        numerical_delta, rel=1e-6
    )
    assert float(center.modeled_greeks.gamma) == pytest.approx(
        numerical_gamma, rel=1e-5
    )
    assert center.modeled_greeks.gamma < 0
    assert center.greek_boundary is False


def test_calibrated_zero_day_scenario_greeks_match_current_summary() -> None:
    mark = european_option("call", 100, 100, 30 / 365, 0.53).price
    result = analyze_manual_position(
        request(
            option(quantity=-2, current_price=mark),
            horizon_days=0,
            calibrate_iv_from_marks=True,
        )
    )
    at_spot = next(row for row in result.scenarios if row.move == 0)
    assert at_spot.modeled_greeks == result.modeled_greeks
    assert at_spot.modeled_greeks.delta < 0
    assert at_spot.modeled_greeks.gamma < 0
    assert at_spot.greek_boundary is False


def test_calendar_horizon_greeks_use_each_legs_remaining_time() -> None:
    later = dict(option(strike=110), expiration="2026-12-01")
    result = analyze_manual_position(
        request(option(quantity=-1), later, horizon_days=100)
    )
    at_spot = next(row for row in result.scenarios if row.move == 0)
    later_estimate = european_option("call", 100, 110, 30 / 365, 0.3)
    assert float(at_spot.modeled_greeks.delta) == pytest.approx(
        -50 + later_estimate.delta * 100
    )
    assert float(at_spot.modeled_greeks.gamma) == pytest.approx(
        later_estimate.gamma * 100
    )
    assert at_spot.greek_boundary is True
    assert all(row.greek_boundary for row in result.timeline[-1].scenarios)


def test_stock_scenario_greeks_are_constant_without_option_boundary_flags() -> None:
    result = analyze_manual_position(
        request(
            {"kind": "stock", "quantity": -12, "entry_price": 100},
            scenario_moves=[-1, 0, 5],
            horizon_days=3650,
        )
    )
    for day in result.timeline:
        for row in day.scenarios:
            assert row.modeled_greeks.delta == -12
            assert row.modeled_greeks.gamma == 0
            assert row.modeled_greeks.theta == 0
            assert row.greek_boundary is False


def test_very_small_finite_position_does_not_overflow_decimal_sizing() -> None:
    result = analyze_manual_position(
        request(
            {"kind": "stock", "quantity": "1e-20", "entry_price": "1e-20"},
            risk_budget=1,
        )
    )
    assert result.sizing.max_position_units == 10**40


def test_tiny_uncovered_tail_is_not_rounded_into_bounded_loss() -> None:
    result = analyze_manual_position(
        request(
            {
                "kind": "stock",
                "quantity": "99.999999999999999999999999999999",
                "entry_price": 100,
            },
            option(quantity=-1),
        )
    )
    assert result.max_loss_bounded is False
    assert result.max_loss is None
