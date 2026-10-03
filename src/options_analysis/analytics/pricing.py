"""European Black-Scholes-Merton estimates with documented Greek units.

Prices are per underlying unit; theta is per calendar day, vega and rho are
per one percentage-point change. This does not model early exercise.
"""

from dataclasses import dataclass
from math import erf, exp, log, pi, sqrt
from typing import Literal


@dataclass(frozen=True)
class OptionEstimate:
    price: float
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float


def _normal(value: float) -> float:
    return (1 + erf(value / sqrt(2))) / 2


def european_option(
    kind: Literal["call", "put"],
    spot: float,
    strike: float,
    years: float,
    volatility: float,
    rate: float = 0.04,
    dividend_yield: float = 0,
) -> OptionEstimate:
    """Price at positive time, or intrinsic at expiry, including zero IV.

    At deterministic/expiry kinks the convention is midpoint delta and zero
    gamma. Those discontinuous boundary Greeks are not hedge estimates.
    Domain inputs enforce finite practical bounds before this function is used.
    """

    sign = 1 if kind == "call" else -1
    if years <= 0:
        intrinsic = max(sign * (spot - strike), 0)
        delta = sign * (1 if intrinsic > 0 else 0.5 if spot == strike else 0)
        return OptionEstimate(intrinsic, delta, 0, 0, 0, 0)

    discounted_spot = spot * exp(-dividend_yield * years)
    discounted_strike = strike * exp(-rate * years)
    if volatility == 0 or spot == 0:
        forward_intrinsic = sign * (discounted_spot - discounted_strike)
        weight = 1 if forward_intrinsic > 0 else 0.5 if forward_intrinsic == 0 else 0
        delta = sign * exp(-dividend_yield * years) * weight
        theta = (
            sign
            * (dividend_yield * discounted_spot - rate * discounted_strike)
            * weight
            / 365
        )
        rho = sign * discounted_strike * years * weight / 100
        return OptionEstimate(max(forward_intrinsic, 0), delta, 0, theta, 0, rho)

    root_time = sqrt(years)
    d1 = (
        log(spot / strike)
        + (rate - dividend_yield + volatility * volatility / 2) * years
    ) / (volatility * root_time)
    d2 = d1 - volatility * root_time
    density = exp(-d1 * d1 / 2) / sqrt(2 * pi)
    price = sign * (
        discounted_spot * _normal(sign * d1) - discounted_strike * _normal(sign * d2)
    )
    delta = sign * exp(-dividend_yield * years) * _normal(sign * d1)
    gamma = exp(-dividend_yield * years) * density / (spot * volatility * root_time)
    theta = (
        -discounted_spot * density * volatility / (2 * root_time)
        - sign * rate * discounted_strike * _normal(sign * d2)
        + sign * dividend_yield * discounted_spot * _normal(sign * d1)
    ) / 365
    vega = discounted_spot * density * root_time / 100
    rho = sign * discounted_strike * years * _normal(sign * d2) / 100
    return OptionEstimate(max(price, 0), delta, gamma, theta, vega, rho)


def implied_volatility_from_price(
    kind: Literal["call", "put"],
    spot: float,
    strike: float,
    years: float,
    price: float,
    rate: float = 0.04,
    dividend_yield: float = 0,
) -> float:
    """Invert this European model within 0-500% IV, or explain why it cannot fit."""
    if years <= 0:
        raise ValueError("IV cannot be inferred at expiration")
    lower = european_option(kind, spot, strike, years, 0, rate, dividend_yield).price
    upper = european_option(kind, spot, strike, years, 5, rate, dividend_yield).price
    tolerance = max(1e-9, abs(price) * 1e-10)
    if price < lower - tolerance or price > upper + tolerance:
        raise ValueError(
            f"mark {price:.6g} is outside this model's 0-500% IV price "
            f"range [{lower:.6g}, {upper:.6g}]"
        )
    if upper - lower <= tolerance:
        raise ValueError(
            "IV is not identifiable from a price insensitive to volatility"
        )
    if abs(price - lower) <= tolerance:
        return 0
    if abs(price - upper) <= tolerance:
        return 5
    left, right = 0.0, 5.0
    for _ in range(80):
        middle = (left + right) / 2
        value = european_option(
            kind, spot, strike, years, middle, rate, dividend_yield
        ).price
        if value < price:
            left = middle
        else:
            right = middle
    result = (left + right) / 2
    if 0 < result < 0.000001:
        raise ValueError("inferred IV is below the supported positive-IV precision")
    return result
