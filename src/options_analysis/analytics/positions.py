"""Pure multiplier-aware position aggregation and payoff analytics."""

from collections.abc import Iterable
from decimal import Decimal
from itertools import pairwise

from options_analysis.domain import (
    AggregateGreeks,
    AssetType,
    DataQualityWarning,
    GreekExposure,
    PayoffPoint,
    PositionAnalysis,
    PositionLeg,
    PutCall,
    ScenarioPoint,
    ValuationMode,
)

_GREEK_NAMES = ("delta", "gamma", "theta", "vega", "rho")


def analyze_enriched_positions(
    positions: tuple[PositionLeg, ...],
    *,
    provider_id: str,
    valuation_mode: ValuationMode,
    scenario_moves: tuple[Decimal, ...],
) -> PositionAnalysis:
    if not positions:
        raise ValueError("at least one position is required")

    warnings = _quote_warnings(positions)
    net_market_value = _complete_sum(item.market_value for item in positions)
    net_cost_basis = _complete_sum(item.cost_basis for item in positions)
    if net_market_value is None:
        warnings.append(
            _warning(
                "incomplete_market_value",
                "At least one leg has no usable current price.",
                "net_market_value",
            )
        )
    if net_cost_basis is None:
        warnings.append(
            _warning(
                "missing_cost_basis",
                "Profit/loss and break-even require an open price for every leg.",
                "net_cost_basis",
            )
        )

    underlyings = {_underlying_symbol(item) for item in positions}
    underlying_symbol = next(iter(underlyings)) if len(underlyings) == 1 else None
    if underlying_symbol is None:
        warnings.append(
            _warning(
                "multiple_underlyings",
                "Payoff and price scenarios require positions on one underlying.",
                "positions",
            )
        )

    underlying_price: Decimal | None = None
    if underlying_symbol is not None:
        underlying_price, price_warning = _underlying_price(positions)
        if price_warning is not None:
            warnings.append(price_warning)
    aggregate = _aggregate_greeks(positions)
    if any(not getattr(aggregate, name).complete for name in _GREEK_NAMES):
        warnings.append(
            _warning(
                "incomplete_greeks",
                "Some provider Greeks are missing. Incomplete exposures are partial "
                "sums, not the total position risk; delta-gamma scenarios require "
                "complete delta and gamma.",
                "aggregate_greeks",
            )
        )

    expirations = {
        item.instrument.option.expiration_date
        for item in positions
        if item.instrument.option is not None
    }
    expiration = next(iter(expirations)) if len(expirations) == 1 else None
    if len(expirations) > 1:
        warnings.append(
            _warning(
                "multiple_expirations",
                "Exact expiration payoff is omitted for calendarized positions.",
                "payoff_points",
            )
        )

    unsupported_terms = tuple(
        item.instrument.symbol
        for item in positions
        if item.instrument.option is not None
        and (
            item.instrument.option.is_adjusted is True
            or item.instrument.option.deliverables
        )
    )
    if unsupported_terms:
        warnings.append(
            _warning(
                "unsupported_payoff_terms",
                "Expiration payoff, break-even, and risk bounds are unavailable for "
                "adjusted contracts or explicit deliverables that this model cannot "
                "value: " + ", ".join(unsupported_terms) + ".",
                "payoff_points",
                "break_even_prices",
                "max_profit",
                "max_loss",
            )
        )
    can_payoff = (
        underlying_symbol is not None
        and len(expirations) <= 1
        and not unsupported_terms
    )
    payoff_points: tuple[PayoffPoint, ...] = ()
    break_evens: tuple[Decimal, ...] = ()
    max_profit: Decimal | None = None
    max_profit_bounded: bool | None = None
    max_loss: Decimal | None = None
    max_loss_bounded: bool | None = None
    if can_payoff:
        prices = _payoff_prices(positions, underlying_price, scenario_moves)
        payoff_points = tuple(
            _payoff_point(positions, price, net_cost_basis) for price in prices
        )
        if net_cost_basis is not None:
            break_evens = _break_even_prices(positions, net_cost_basis)
            (
                max_profit,
                max_profit_bounded,
                max_loss,
                max_loss_bounded,
            ) = _payoff_bounds(positions, net_cost_basis)

    scenarios = _scenarios(underlying_price, aggregate, scenario_moves)
    assumptions = (
        "Quantities are signed; positive is long and negative is short.",
        "Option premiums and Greeks are per underlying unit and use each multiplier.",
        (
            "Expiration payoff assumes standard contract deliverables, one shared "
            "expiration, and ignores fees and exercise friction. Unknown adjustment "
            "status is assumed standard; confirm the contract terms."
        ),
        (
            "Price scenarios estimate the change in position value from today, not "
            "total profit/loss since entry. They use a local delta-gamma approximation "
            "with volatility and time unchanged; large moves can be inaccurate."
        ),
    )
    return PositionAnalysis(
        provider_id=provider_id,
        valuation_mode=valuation_mode,
        positions=positions,
        underlying_symbol=underlying_symbol,
        underlying_price=underlying_price,
        net_market_value=net_market_value,
        net_cost_basis=net_cost_basis,
        aggregate_greeks=aggregate,
        expiration_date=expiration,
        payoff_points=payoff_points,
        break_even_prices=break_evens,
        max_profit=max_profit,
        max_profit_bounded=max_profit_bounded,
        max_loss=max_loss,
        max_loss_bounded=max_loss_bounded,
        scenarios=scenarios,
        assumptions=assumptions,
        warnings=tuple(warnings),
    )


def _quote_warnings(
    positions: tuple[PositionLeg, ...],
) -> list[DataQualityWarning]:
    warnings: list[DataQualityWarning] = []
    for index, position in enumerate(positions):
        quote = position.current_quote
        if quote is None:
            continue
        for warning in quote.warnings:
            prefix = f"positions[{index}].current_quote"
            warnings.append(
                DataQualityWarning(
                    code=warning.code,
                    message=f"{position.instrument.symbol}: {warning.message}",
                    fields=tuple(f"{prefix}.{field}" for field in warning.fields)
                    or (prefix,),
                )
            )
    return warnings


def _aggregate_greeks(positions: tuple[PositionLeg, ...]) -> AggregateGreeks:
    values = {name: _aggregate_one_greek(positions, name) for name in _GREEK_NAMES}
    return AggregateGreeks(**values)


def _aggregate_one_greek(
    positions: tuple[PositionLeg, ...], name: str
) -> GreekExposure:
    total = Decimal()
    missing: list[str] = []
    for position in positions:
        if position.instrument.asset_type in {AssetType.EQUITY, AssetType.ETF}:
            if name == "delta":
                total += position.quantity
            continue
        quote = position.current_quote
        greeks = quote.greeks if quote is not None else None
        value = getattr(greeks, name) if greeks is not None else None
        if value is None:
            missing.append(position.instrument.symbol)
            continue
        total += value * position.quantity * _multiplier(position)
    return GreekExposure(
        value=total,
        complete=not missing,
        missing_symbols=tuple(missing),
    )


def _underlying_symbol(position: PositionLeg) -> str:
    option = position.instrument.option
    return (
        option.underlying_symbol if option is not None else position.instrument.symbol
    )


def _underlying_price(
    positions: tuple[PositionLeg, ...],
) -> tuple[Decimal | None, DataQualityWarning | None]:
    candidates: list[Decimal] = []
    for position in positions:
        quote = position.current_quote
        if quote is None:
            continue
        if quote.underlying_price is not None:
            candidates.append(quote.underlying_price)
        elif position.instrument.asset_type in {AssetType.EQUITY, AssetType.ETF}:
            price = _quote_price(quote)
            if price is not None:
                candidates.append(price)
    if not candidates:
        return None, _warning(
            "missing_underlying_price",
            "No underlying price is available for scenario generation.",
            "underlying_price",
        )
    selected = candidates[0]
    tolerance = max(selected * Decimal("0.005"), Decimal("0.01"))
    if any(abs(item - selected) > tolerance for item in candidates[1:]):
        return selected, _warning(
            "inconsistent_underlying_prices",
            "Leg quotes contain materially different underlying prices.",
            "underlying_price",
        )
    return selected, None


def _quote_price(quote: object) -> Decimal | None:
    mark = getattr(quote, "mark", None)
    if isinstance(mark, Decimal):
        return mark
    bid = getattr(quote, "bid", None)
    ask = getattr(quote, "ask", None)
    if isinstance(bid, Decimal) and isinstance(ask, Decimal):
        return (bid + ask) / Decimal("2")
    last = getattr(quote, "last", None)
    return last if isinstance(last, Decimal) else None


def _payoff_prices(
    positions: tuple[PositionLeg, ...],
    underlying_price: Decimal | None,
    scenario_moves: tuple[Decimal, ...],
) -> tuple[Decimal, ...]:
    values = {Decimal()}
    values.update(
        item.instrument.option.strike
        for item in positions
        if item.instrument.option is not None
    )
    if underlying_price is not None:
        values.add(underlying_price)
        values.update(
            max(Decimal(), underlying_price * (Decimal("1") + move))
            for move in scenario_moves
        )
    # Include the final linear segment beyond the highest strike. Otherwise a
    # far out-of-the-money call can appear to have no upside in the payoff chart.
    highest = max(values)
    if highest > 0:
        values.add(highest * Decimal("1.2"))
    return tuple(sorted(values))


def _payoff_point(
    positions: tuple[PositionLeg, ...],
    underlying_price: Decimal,
    net_cost_basis: Decimal | None,
) -> PayoffPoint:
    value = _terminal_value(positions, underlying_price)
    return PayoffPoint(
        underlying_price=underlying_price,
        position_value=value,
        profit_loss=(value - net_cost_basis if net_cost_basis is not None else None),
    )


def _terminal_value(
    positions: tuple[PositionLeg, ...], underlying_price: Decimal
) -> Decimal:
    total = Decimal()
    for position in positions:
        option = position.instrument.option
        if option is None:
            total += underlying_price * position.quantity
            continue
        intrinsic = (
            max(underlying_price - option.strike, Decimal())
            if option.put_call is PutCall.CALL
            else max(option.strike - underlying_price, Decimal())
        )
        total += intrinsic * position.quantity * option.multiplier
    return total


def _break_even_prices(
    positions: tuple[PositionLeg, ...], net_cost_basis: Decimal
) -> tuple[Decimal, ...]:
    knots = tuple(
        sorted(
            {Decimal()}
            | {
                item.instrument.option.strike
                for item in positions
                if item.instrument.option is not None
            }
        )
    )

    def profit(price: Decimal) -> Decimal:
        return _terminal_value(positions, price) - net_cost_basis

    roots: set[Decimal] = set()
    for left, right in pairwise(knots):
        left_value = profit(left)
        right_value = profit(right)
        if left_value == 0:
            roots.add(left)
        if right_value == 0:
            roots.add(right)
        if left_value * right_value < 0:
            roots.add(left - left_value * (right - left) / (right_value - left_value))
    last = knots[-1]
    last_value = profit(last)
    if last_value == 0:
        roots.add(last)
    tail_slope = _high_price_slope(positions)
    if tail_slope != 0:
        tail_root = last - last_value / tail_slope
        if tail_root > last:
            roots.add(tail_root)
    return tuple(sorted(root for root in roots if root >= 0))


def _payoff_bounds(
    positions: tuple[PositionLeg, ...], net_cost_basis: Decimal
) -> tuple[Decimal | None, bool, Decimal | None, bool]:
    knots = {
        Decimal(),
        *(
            item.instrument.option.strike
            for item in positions
            if item.instrument.option is not None
        ),
    }
    values = [_terminal_value(positions, price) - net_cost_basis for price in knots]
    tail_slope = _high_price_slope(positions)
    profit_bounded = tail_slope <= 0
    loss_bounded = tail_slope >= 0
    return (
        max(values) if profit_bounded else None,
        profit_bounded,
        min(values) if loss_bounded else None,
        loss_bounded,
    )


def _high_price_slope(positions: tuple[PositionLeg, ...]) -> Decimal:
    slope = Decimal()
    for position in positions:
        option = position.instrument.option
        if option is None:
            slope += position.quantity
        elif option.put_call is PutCall.CALL:
            slope += position.quantity * option.multiplier
    return slope


def _scenarios(
    underlying_price: Decimal | None,
    aggregate: AggregateGreeks,
    scenario_moves: tuple[Decimal, ...],
) -> tuple[ScenarioPoint, ...]:
    if underlying_price is None:
        return ()
    complete = aggregate.delta.complete and aggregate.gamma.complete
    return tuple(
        ScenarioPoint(
            underlying_price=max(Decimal(), underlying_price * (Decimal("1") + move)),
            underlying_change=(
                max(Decimal(), underlying_price * (Decimal("1") + move))
                - underlying_price
            ),
            estimated_profit_loss=(
                aggregate.delta.value * underlying_price * move
                + aggregate.gamma.value * (underlying_price * move) ** 2 / Decimal("2")
                if complete
                else None
            ),
            method="delta_gamma",
        )
        for move in scenario_moves
    )


def _multiplier(position: PositionLeg) -> Decimal:
    option = position.instrument.option
    return option.multiplier if option is not None else Decimal("1")


def _complete_sum(values: Iterable[Decimal | None]) -> Decimal | None:
    items = tuple(values)
    if any(item is None for item in items):
        return None
    return sum((item for item in items if item is not None), start=Decimal())


def _warning(code: str, message: str, *fields: str) -> DataQualityWarning:
    return DataQualityWarning(code=code, message=message, fields=fields)
