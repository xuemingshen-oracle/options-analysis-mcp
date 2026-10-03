"""Deterministic research for manually supplied, standard option positions."""

from datetime import timedelta
from decimal import Decimal, localcontext
from itertools import pairwise
from typing import Literal

from options_analysis.analytics.pricing import (
    OptionEstimate,
    european_option,
    implied_volatility_from_price,
)
from options_analysis.domain.research import (
    ManualPositionLeg,
    ManualResearchAnalysis,
    ManualResearchRequest,
    ResearchFinding,
    ResearchGreeks,
    ResearchLegBreakdown,
    ResearchPayoffPoint,
    ResearchScenario,
    ResearchScenarioSlice,
    ResearchSizing,
)

ZERO = Decimal(0)
ONE = Decimal(1)


def _decimal(value: float) -> Decimal:
    return Decimal(str(value)) if abs(value) >= 1e-12 else ZERO


def _units(leg: ManualPositionLeg) -> Decimal:
    assert leg.multiplier is not None
    return leg.quantity * leg.multiplier


def _intrinsic(leg: ManualPositionLeg, spot: Decimal) -> Decimal:
    if leg.kind == "stock":
        return spot
    assert leg.strike is not None
    return max(spot - leg.strike if leg.kind == "call" else leg.strike - spot, ZERO)


def _estimate(
    leg: ManualPositionLeg,
    request: ManualResearchRequest,
    spot: Decimal,
    days: int = 0,
    iv_shift: Decimal = ZERO,
) -> OptionEstimate:
    if leg.kind == "stock":
        return OptionEstimate(float(spot), 1, 0, 0, 0, 0)
    assert leg.strike is not None and leg.expiration is not None
    remaining = (leg.expiration - request.valuation_date).days - days
    return european_option(
        leg.kind,
        float(spot),
        float(leg.strike),
        remaining / 365,
        float(leg.implied_volatility + iv_shift),
        float(request.risk_free_rate),
        float(request.dividend_yield),
    )


def _terminal_value(legs: tuple[ManualPositionLeg, ...], spot: Decimal) -> Decimal:
    return sum((_intrinsic(leg, spot) * _units(leg) for leg in legs), ZERO)


def _model_value(
    request: ManualResearchRequest,
    spot: Decimal,
    days: int,
    iv_shift: Decimal,
) -> Decimal:
    total = ZERO
    for leg in request.legs:
        # Preserve exact decimal terminal values instead of round-tripping floats.
        if leg.kind == "stock" or (
            leg.expiration is not None
            and (leg.expiration - request.valuation_date).days == days
        ):
            total += _intrinsic(leg, spot) * _units(leg)
        else:
            total += _decimal(
                _estimate(leg, request, spot, days, iv_shift).price
            ) * _units(leg)
    return total


def _aggregate_greeks(
    request: ManualResearchRequest,
    spot: Decimal,
    days: int = 0,
    iv_shift: Decimal = ZERO,
) -> ResearchGreeks:
    totals = {name: ZERO for name in ("delta", "gamma", "theta", "vega", "rho")}
    for leg in request.legs:
        estimate = _estimate(leg, request, spot, days, iv_shift)
        units = _units(leg)
        for name in totals:
            totals[name] += _decimal(getattr(estimate, name)) * units
    return ResearchGreeks(**totals)


def _expiry_metrics(
    legs: tuple[ManualPositionLeg, ...],
    basis: Decimal,
) -> tuple[Decimal | None, bool, Decimal | None, bool, tuple[Decimal, ...], bool]:
    knots = sorted({ZERO, *(leg.strike for leg in legs if leg.strike is not None)})
    values = {spot: _terminal_value(legs, spot) - basis for spot in knots}
    slope = sum((_units(leg) for leg in legs if leg.kind in {"stock", "call"}), ZERO)
    roots: set[Decimal] = set()
    flat_zero = False
    for left, right in pairwise(knots):
        lv, rv = values[left], values[right]
        if lv == 0:
            roots.add(left)
        if rv == 0:
            roots.add(right)
        if lv == rv == 0:
            flat_zero = True
        if lv * rv < 0:
            roots.add(left - lv * (right - left) / (rv - lv))
    last = knots[-1]
    if values[last] == 0:
        roots.add(last)
        flat_zero = flat_zero or slope == 0
    if slope:
        tail_root = last - values[last] / slope
        if tail_root > last:
            roots.add(tail_root)
    return (
        max(values.values()) if slope <= 0 else None,
        slope <= 0,
        min(values.values()) if slope >= 0 else None,
        slope >= 0,
        tuple(sorted(roots)),
        flat_zero,
    )


def _chart_prices(
    request: ManualResearchRequest, roots: tuple[Decimal, ...]
) -> tuple[Decimal, ...]:
    strikes = [leg.strike for leg in request.legs if leg.strike is not None]
    scenario_prices = [request.spot * (ONE + move) for move in request.scenario_moves]
    low = max(
        ZERO,
        min(
            request.spot * Decimal("0.7"),
            *scenario_prices,
            *(strike * Decimal("0.9") for strike in strikes),
        ),
    )
    high = max(
        request.spot * Decimal("1.3"),
        *scenario_prices,
        *(strike * Decimal("1.1") for strike in strikes),
    )
    points = {low + (high - low) * Decimal(index) / Decimal(80) for index in range(81)}
    points.update((request.spot, *strikes, *scenario_prices))
    points.update(root for root in roots if low <= root <= high)
    return tuple(sorted(points))


def _finding(
    code: str,
    title: str,
    detail: str,
    severity: Literal["info", "caution", "danger"] = "info",
) -> ResearchFinding:
    return ResearchFinding(code=code, severity=severity, title=title, detail=detail)


def _whole_position_units(budget: Decimal, risk: Decimal) -> int:
    # Decimal floor division raises InvalidOperation when the integer quotient
    # exceeds its arithmetic context precision. Integer ratios remain exact.
    budget_numerator, budget_denominator = budget.as_integer_ratio()
    risk_numerator, risk_denominator = risk.as_integer_ratio()
    return (budget_numerator * risk_denominator) // (
        budget_denominator * risk_numerator
    )


def analyze_manual_position(request: ManualResearchRequest) -> ManualResearchAnalysis:
    """Analyze within precision exceeding the bounded inputs' exact products.

    Up to three 32-digit inputs multiply per leg and 40 legs aggregate. The
    local context prevents small uncovered tails disappearing by cancellation
    against a larger stock or option position. It does not alter caller state.
    """
    with localcontext() as context:
        context.prec = 128
        return _analyze_manual_position(request)


def _analyze_manual_position(request: ManualResearchRequest) -> ManualResearchAnalysis:
    """Analyze one underlying without quote providers or network access.

    Current value uses entered marks where supplied, otherwise the model.
    Horizon scenarios are always theoretical and include the same reserved
    round-trip fees as the current and exact expiry profit/loss displays.
    """

    findings: list[ResearchFinding] = []
    input_ivs = tuple(leg.implied_volatility for leg in request.legs)
    calibrated_indices: set[int] = set()
    if request.calibrate_iv_from_marks:
        effective_legs: list[ManualPositionLeg] = []
        for index, leg in enumerate(request.legs):
            if leg.kind != "stock" and leg.current_price is not None:
                assert leg.strike is not None and leg.expiration is not None
                try:
                    iv = implied_volatility_from_price(
                        leg.kind,
                        float(request.spot),
                        float(leg.strike),
                        (leg.expiration - request.valuation_date).days / 365,
                        float(leg.current_price),
                        float(request.risk_free_rate),
                        float(request.dividend_yield),
                    )
                    leg = leg.model_copy(update={"implied_volatility": _decimal(iv)})
                    calibrated_indices.add(index)
                except ValueError as error:
                    findings.append(
                        _finding(
                            f"iv_calibration_failed_{index}",
                            f"Leg {index + 1}: IV calibration unavailable",
                            f"{error}. Entered IV is retained; reconcile mark, "
                            "spot and "
                            "exercise assumptions.",
                            "caution",
                        )
                    )
            effective_legs.append(leg)
        request = request.model_copy(update={"legs": tuple(effective_legs)})
        if calibrated_indices:
            findings.append(
                _finding(
                    "iv_calibrated",
                    "IV calibrated to entered marks",
                    f"{len(calibrated_indices)} option legs use IV inferred from this "
                    "European model. Matching the current mark does not validate its "
                    "future prices, early-exercise assumptions or executable "
                    "liquidity.",
                )
            )
    for leg in request.legs:
        if leg.kind != "stock":
            shifted = leg.implied_volatility + request.iv_shift
            if not 0 <= shifted <= 5 or 0 < shifted < Decimal("0.000001"):
                raise ValueError(
                    "effective shifted IV must be zero or between 0.000001 "
                    "and 5 after calibration; adjust IV shift"
                )
    option_legs = tuple(leg for leg in request.legs if leg.kind != "stock")
    expirations = {leg.expiration for leg in option_legs if leg.expiration is not None}
    earliest_days = min(
        ((expiry - request.valuation_date).days for expiry in expirations), default=None
    )
    horizon = (
        min(request.horizon_days, earliest_days)
        if earliest_days is not None
        else request.horizon_days
    )
    if horizon != request.horizon_days:
        findings.append(
            _finding(
                "horizon_capped",
                "Horizon capped at the first expiration",
                f"Requested {request.horizon_days} days; modeled {horizon} days. "
                "Later dates require an explicit exercise, assignment or close-out "
                "plan.",
                "caution",
            )
        )
    entry = sum((leg.entry_price * _units(leg) for leg in request.legs), ZERO)
    fees = request.fixed_fees + 2 * request.fee_per_contract * sum(
        (abs(leg.quantity) for leg in option_legs), ZERO
    )
    basis = entry + fees
    breakdown: list[ResearchLegBreakdown] = []
    modeled_marks = 0
    mismatch_indices: list[int] = []
    for index, leg in enumerate(request.legs):
        estimate = _estimate(leg, request, request.spot)
        model_price = _decimal(estimate.price)
        current_price = (
            leg.current_price if leg.current_price is not None else model_price
        )
        if leg.current_price is None:
            modeled_marks += 1
        elif abs(current_price - model_price) > max(
            Decimal("0.05"), model_price * Decimal("0.1")
        ):
            mismatch_indices.append(index + 1)
        units = _units(leg)
        intrinsic = _intrinsic(leg, request.spot)
        assert leg.multiplier is not None
        breakdown.append(
            ResearchLegBreakdown(
                index=index,
                kind=leg.kind,
                quantity=leg.quantity,
                multiplier=leg.multiplier,
                entry_price=leg.entry_price,
                current_price=current_price,
                model_price=model_price,
                implied_volatility=leg.implied_volatility,
                input_implied_volatility=input_ivs[index],
                iv_source="calibrated" if index in calibrated_indices else "entered",
                intrinsic_value=intrinsic,
                extrinsic_value=current_price - intrinsic
                if leg.kind != "stock"
                else ZERO,
                entry_value=leg.entry_price * units,
                current_value=current_price * units,
                model_value=model_price * units,
                profit_loss=(current_price - leg.entry_price) * units,
            )
        )
    current_value = sum((leg.current_value for leg in breakdown), ZERO)
    current_model_value = sum((leg.model_value for leg in breakdown), ZERO)
    if modeled_marks:
        findings.append(
            _finding(
                "modeled_current_marks",
                "Some current values are modeled",
                f"{modeled_marks} of {len(request.legs)} legs have no current mark. "
                "Their current values use the entered spot and IV; they are not "
                "executable quotes.",
            )
        )
    if mismatch_indices:
        findings.append(
            _finding(
                "mark_model_divergence",
                "Entered marks differ from the model",
                f"Legs {', '.join(map(str, mismatch_indices))} differ by more than 10% "
                "and $0.05 per unit. Reconcile IV, quote time, dividends and exercise"
                " style. "
                "At zero days and zero IV shift, a modeled scenario can still differ "
                "from current marks.",
                "caution",
            )
        )
    if any(leg.extrinsic_value < 0 for leg in breakdown if leg.kind != "stock"):
        findings.append(
            _finding(
                "negative_extrinsic",
                "A current option value is below intrinsic",
                "Check entered marks and spot consistency. A European model can be "
                "below "
                "intrinsic because it excludes immediate exercise.",
                "caution",
            )
        )

    max_profit = max_loss = None
    profit_bounded: bool | None = None
    loss_bounded: bool | None = None
    roots: tuple[Decimal, ...] = ()
    if len(expirations) <= 1:
        max_profit, profit_bounded, max_loss, loss_bounded, roots, flat = (
            _expiry_metrics(request.legs, basis)
        )
        if flat:
            findings.append(
                _finding(
                    "flat_break_even",
                    "Break-even includes a flat interval",
                    "Reported break-even prices mark boundaries; some intervening or "
                    "tail "
                    "prices also return zero profit/loss.",
                )
            )
    else:
        findings.append(
            _finding(
                "multiple_expirations",
                "Calendar position: terminal bounds are unavailable",
                "Exact expiry payoff, break-evens and maximum loss require one shared"
                " expiry. "
                "The horizon values remaining options theoretically at the earliest "
                "expiry; "
                "they are not guaranteed liquidation values.",
                "caution",
            )
        )
    if loss_bounded is False:
        findings.append(
            _finding(
                "unbounded_loss",
                "Loss grows without a finite upper-price bound",
                "The combined stock and call exposure loses more as the underlying "
                "rises. "
                "A finite chart range does not cap this risk.",
                "danger",
            )
        )
    elif max_loss is not None and max_loss >= 0:
        findings.append(
            _finding(
                "no_modeled_loss",
                "Inputs produce no terminal loss",
                "Verify entry prices, signed quantities and all fees. This "
                "mathematical result "
                "does not establish an executable arbitrage or remove interim funding"
                " risk.",
                "caution",
            )
        )
    if earliest_days is not None and earliest_days <= 7:
        findings.append(
            _finding(
                "near_expiration",
                "First expiration is within seven days",
                f"{earliest_days} calendar days remain. Exercise cutoffs, pin risk "
                "and rapidly "
                "changing Greeks can dominate a smooth theoretical estimate.",
                "caution",
            )
        )
    if any(leg.quantity < 0 for leg in option_legs):
        findings.append(
            _finding(
                "short_option_assignment",
                "Short options can create stock obligations",
                "American-style short options may be assigned early. A protective "
                "long leg "
                "does not automatically fund or exercise against assignment. Confirm "
                "cash, "
                "share availability, dividend dates and broker exercise procedures.",
                "caution",
            )
        )
    if any(leg.implied_volatility == 0 for leg in option_legs) or earliest_days == 0:
        findings.append(
            _finding(
                "boundary_greeks",
                "Boundary Greeks use a limiting convention",
                "At zero volatility or expiry, delta can jump at the exercise "
                "boundary. "
                "The model reports zero gamma at that discontinuity; do not use it as"
                " a hedge estimate.",
                "caution",
            )
        )

    risk = max(ZERO, -max_loss) if max_loss is not None else None
    budget = request.risk_budget
    max_units = (
        _whole_position_units(budget, risk)
        if budget is not None and risk is not None and risk > 0
        else None
    )
    sizing = ResearchSizing(
        risk_budget=budget,
        risk_per_position=risk,
        max_position_units=max_units,
        fits_budget=risk <= budget if risk is not None and budget is not None else None,
        budget_used_percent=risk / budget * 100
        if risk is not None and budget is not None
        else None,
    )
    if budget is not None:
        if risk is None:
            findings.append(
                _finding(
                    "budget_unavailable",
                    "A maximum-loss budget cannot size this position",
                    "The position has an unbounded or unavailable terminal loss. "
                    "Scenario losses are not a substitute for a hard loss limit.",
                    "caution",
                )
            )
        elif risk > budget:
            findings.append(
                _finding(
                    "budget_exceeded",
                    "Entered position exceeds the loss budget",
                    f"Modeled terminal risk is ${risk:,.2f}, "
                    f"versus a ${budget:,.2f} budget. "
                    "Sizing counts complete copies of all entered legs and their "
                    "reserved fees.",
                    "danger",
                )
            )

    def scenarios(days: int) -> tuple[ResearchScenario, ...]:
        results: list[ResearchScenario] = []
        for move in request.scenario_moves:
            price = request.spot * (ONE + move)
            value = _model_value(request, price, days, request.iv_shift)
            results.append(
                ResearchScenario(
                    move=move,
                    underlying_price=price,
                    position_value=value,
                    profit_loss=value - basis,
                    change_from_today=value - current_value,
                    modeled_greeks=_aggregate_greeks(
                        request, price, days, request.iv_shift
                    ),
                    greek_boundary=any(
                        leg.implied_volatility + request.iv_shift == 0
                        or price == 0
                        or (
                            leg.expiration is not None
                            and (leg.expiration - request.valuation_date).days == days
                        )
                        for leg in option_legs
                    ),
                )
            )
        return tuple(results)

    days_set = {0, horizon, *request.scenario_days}
    if earliest_days is not None:
        days_set = {min(day, earliest_days) for day in days_set} | {earliest_days}
    timeline = tuple(
        ResearchScenarioSlice(
            horizon_days=days,
            horizon_date=request.valuation_date + timedelta(days=days),
            scenarios=scenarios(days),
        )
        for days in sorted(days_set)
    )
    prices = _chart_prices(request, roots)
    payoff_points = (
        tuple(
            ResearchPayoffPoint(
                underlying_price=spot,
                position_value=_terminal_value(request.legs, spot),
                profit_loss=_terminal_value(request.legs, spot) - basis,
            )
            for spot in prices
        )
        if len(expirations) <= 1
        else ()
    )
    horizon_points = tuple(
        ResearchPayoffPoint(
            underlying_price=spot,
            position_value=(
                value := _model_value(request, spot, horizon, request.iv_shift)
            ),
            profit_loss=value - basis,
        )
        for spot in prices
    )
    assumptions = (
        "Positive quantity is long; negative is short. Option prices are per "
        "underlying unit, stock quantities are shares.",
        "Entry value is signed premium/share cost. Terminal intrinsic value is "
        "counted once; opening credits reduce the net entry value.",
        "All P/L reserves fee_per_contract twice per absolute option contract (entry "
        "and exit), plus fixed_fees once for the complete position.",
        "Current values use entered marks where available. Scenarios use European "
        "Black-Scholes-Merton with constant rates/dividend yield and each leg's IV "
        "plus the absolute IV shift.",
        "IV is a decimal (0.30 = 30%); IV shift 0.05 means five volatility percentage"
        " points. Rates and dividend yield are annual decimals; time uses actual "
        "calendar days / 365.",
        "Scenarios report both P/L from entry after reserved fees and value change "
        "from today's entered/model marks. A zero-day scenario may differ from "
        "entered marks.",
        "Summary Greeks use today's unshifted IV. Scenario Greeks use each "
        "scenario's price, date and shifted IV. Units: delta per $1, gamma as "
        "delta change per $1, theta per calendar day, vega per IV percentage "
        "point, rho per rate percentage point.",
        "Scenario greek_boundary flags expiry, zero-IV or zero-spot limits. "
        "At exercise kinks the convention is midpoint delta and zero gamma; "
        "these boundary values are not reliable hedge estimates.",
        "The model excludes early exercise, discrete dividends, bid/ask spreads, "
        "liquidity, borrow fees, margin, taxes and exercise/assignment cash flows. "
        "Stock dividend cash flows are not added to P/L.",
        "Only standard share-deliverable options are supported. Multiplier scales "
        "premium and intrinsic value equally; adjusted cash or basket deliverables "
        "are unsupported.",
        "Calendar scenarios stop at the earliest expiration. Timeline dates beyond it"
        " are capped and deduplicated; later options retain theoretical time value.",
        "Exact bounds refer to expiry prices at or above zero, not interim drawdown "
        "or buying-power requirements. Sizing scales complete copies of all entered "
        "legs and their full reserved fees.",
    )
    return ManualResearchAnalysis(
        symbol=request.symbol,
        valuation_date=request.valuation_date,
        spot=request.spot,
        legs=request.legs,
        leg_breakdown=tuple(breakdown),
        requested_horizon_days=request.horizon_days,
        horizon_days=horizon,
        horizon_date=request.valuation_date + timedelta(days=horizon),
        expiration_date=next(iter(expirations)) if len(expirations) == 1 else None,
        net_entry_value=entry,
        current_value=current_value,
        current_model_value=current_model_value,
        current_profit_loss=current_value - basis,
        total_fees=fees,
        modeled_greeks=_aggregate_greeks(request, request.spot),
        max_profit=max_profit,
        max_profit_bounded=profit_bounded,
        max_loss=max_loss,
        max_loss_bounded=loss_bounded,
        break_even_prices=roots,
        reward_risk_ratio=max_profit / risk
        if max_profit is not None and max_profit > 0 and risk is not None and risk > 0
        else None,
        payoff_points=payoff_points,
        horizon_points=horizon_points,
        scenarios=scenarios(horizon),
        timeline=timeline,
        findings=tuple(findings),
        sizing=sizing,
        assumptions=assumptions,
    )
