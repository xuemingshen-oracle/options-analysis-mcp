"""Explicit, provider-independent inputs and outputs for position research."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Self

from pydantic import Field, PlainSerializer, field_validator, model_validator

from options_analysis.domain._base import DomainModel

# Decimal's default JSON strings may contain exponents (including "0E-16"),
# which contradict Pydantic's Decimal string pattern in MCP output schemas.
ResearchDecimal = Annotated[
    Decimal,
    PlainSerializer(
        lambda value: format(value, "f"), return_type=str, when_used="json"
    ),
]


def _bounded_precision(value: Decimal) -> Decimal:
    """Keep fixed-point responses bounded even for hostile exponent inputs."""
    if not value.is_finite():
        raise ValueError("numeric inputs must be finite")
    parts = value.as_tuple()
    if not isinstance(parts.exponent, int) or parts.exponent < -30:
        raise ValueError("numeric inputs support at most 30 decimal places")
    if len(parts.digits) > 32:
        raise ValueError("numeric inputs support at most 32 significant digits")
    return value


class ManualPositionLeg(DomainModel):
    kind: Literal["stock", "call", "put"]
    quantity: ResearchDecimal = Field(ge=Decimal("-1000000"), le=Decimal("1000000"))
    entry_price: ResearchDecimal = Field(ge=Decimal("0"), le=Decimal("1000000"))
    current_price: ResearchDecimal | None = Field(default=None, ge=0, le=1000000)
    strike: ResearchDecimal | None = Field(
        default=None, ge=Decimal("0.000001"), le=1000000
    )
    expiration: date | None = None
    implied_volatility: ResearchDecimal = Field(default=Decimal("0.30"), ge=0, le=5)
    multiplier: ResearchDecimal | None = Field(default=None, gt=0, le=10000)

    @field_validator(
        "quantity",
        "entry_price",
        "current_price",
        "strike",
        "implied_volatility",
        "multiplier",
    )
    @classmethod
    def bounded_numeric_precision(cls, value: Decimal | None) -> Decimal | None:
        return None if value is None else _bounded_precision(value)

    @model_validator(mode="after")
    def validate_terms(self) -> Self:
        if self.quantity == 0:
            raise ValueError("leg quantity must be nonzero")
        if 0 < self.implied_volatility < Decimal("0.000001"):
            raise ValueError("IV must be zero or at least 0.000001")
        if self.kind == "stock":
            if self.strike is not None or self.expiration is not None:
                raise ValueError("stock legs cannot have a strike or expiration")
            if self.multiplier not in {None, Decimal(1)}:
                raise ValueError("stock multiplier must be 1")
            object.__setattr__(self, "multiplier", Decimal(1))
        else:
            if self.strike is None or self.expiration is None:
                raise ValueError("option legs require a strike and expiration")
            if self.quantity != self.quantity.to_integral_value():
                raise ValueError("option quantity must be a whole number of contracts")
            if self.multiplier is None:
                object.__setattr__(self, "multiplier", Decimal(100))
        return self


class ManualResearchRequest(DomainModel):
    symbol: str = Field(default="SPY", min_length=1, max_length=20)
    spot: ResearchDecimal = Field(ge=Decimal("0.000001"), le=1000000)
    valuation_date: date
    legs: tuple[ManualPositionLeg, ...] = Field(min_length=1, max_length=40)
    risk_free_rate: ResearchDecimal = Field(
        default=Decimal("0.04"), ge=Decimal("-0.1"), le=1
    )
    dividend_yield: ResearchDecimal = Field(default=Decimal("0"), ge=0, le=1)
    fee_per_contract: ResearchDecimal = Field(default=Decimal("0"), ge=0, le=1000)
    fixed_fees: ResearchDecimal = Field(default=Decimal("0"), ge=0, le=1000000)
    horizon_days: int = Field(default=7, ge=0, le=3650)
    calibrate_iv_from_marks: bool = False
    scenario_days: tuple[int, ...] = Field(default=(0, 7, 30), max_length=8)
    iv_shift: ResearchDecimal = Field(default=Decimal("0"), ge=-5, le=5)
    scenario_moves: tuple[ResearchDecimal, ...] = Field(
        default=(
            Decimal("-0.2"),
            Decimal("-0.1"),
            Decimal("0"),
            Decimal("0.1"),
            Decimal("0.2"),
        ),
        min_length=1,
        max_length=21,
    )
    risk_budget: ResearchDecimal | None = Field(default=None, gt=0, le=1000000000)

    @field_validator(
        "spot",
        "risk_free_rate",
        "dividend_yield",
        "fee_per_contract",
        "fixed_fees",
        "iv_shift",
        "risk_budget",
    )
    @classmethod
    def bounded_numeric_precision(cls, value: Decimal | None) -> Decimal | None:
        return None if value is None else _bounded_precision(value)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized or not normalized.isprintable():
            raise ValueError("symbol must contain printable text")
        return normalized

    @field_validator("scenario_moves")
    @classmethod
    def validate_moves(
        cls, values: tuple[ResearchDecimal, ...]
    ) -> tuple[ResearchDecimal, ...]:
        for value in values:
            _bounded_precision(value)
        if any(value < -1 or value > 5 for value in values):
            raise ValueError("scenario moves must be finite and between -1 and 5")
        return tuple(sorted(set(values)))

    @field_validator("scenario_days")
    @classmethod
    def validate_scenario_days(cls, values: tuple[int, ...]) -> tuple[int, ...]:
        if any(not 0 <= value <= 3650 for value in values):
            raise ValueError("scenario days must be between 0 and 3650")
        return tuple(sorted(set(values)))

    @model_validator(mode="after")
    def validate_dates_and_volatility(self) -> Self:
        option_expirations = [leg.expiration for leg in self.legs if leg.expiration]
        if not option_expirations:
            longest = max(self.horizon_days, *self.scenario_days, 0)
            if longest > (date.max - self.valuation_date).days:
                raise ValueError("scenario date exceeds the supported calendar")
        for leg in self.legs:
            if leg.expiration is not None:
                days = (leg.expiration - self.valuation_date).days
                if not 0 <= days <= 3650:
                    raise ValueError(
                        "option expiration must be within 10 years of valuation date"
                    )
                if self.calibrate_iv_from_marks and leg.current_price is not None:
                    continue
                if not 0 <= leg.implied_volatility + self.iv_shift <= 5:
                    raise ValueError(
                        "shifted option IV must be between 0 and 500%; "
                        "adjust IV or shift"
                    )
                if 0 < leg.implied_volatility + self.iv_shift < Decimal("0.000001"):
                    raise ValueError("shifted IV must be zero or at least 0.000001")
        return self


class ResearchGreeks(DomainModel):
    delta: ResearchDecimal
    gamma: ResearchDecimal
    theta: ResearchDecimal
    vega: ResearchDecimal
    rho: ResearchDecimal


class ResearchPayoffPoint(DomainModel):
    underlying_price: ResearchDecimal
    position_value: ResearchDecimal
    profit_loss: ResearchDecimal


class ResearchScenario(DomainModel):
    move: ResearchDecimal
    underlying_price: ResearchDecimal
    position_value: ResearchDecimal
    profit_loss: ResearchDecimal
    change_from_today: ResearchDecimal
    modeled_greeks: ResearchGreeks
    greek_boundary: bool


class ResearchScenarioSlice(DomainModel):
    horizon_days: int
    horizon_date: date
    scenarios: tuple[ResearchScenario, ...]


class ResearchLegBreakdown(DomainModel):
    index: int
    kind: Literal["stock", "call", "put"]
    quantity: ResearchDecimal
    multiplier: ResearchDecimal
    entry_price: ResearchDecimal
    current_price: ResearchDecimal
    model_price: ResearchDecimal
    implied_volatility: ResearchDecimal
    input_implied_volatility: ResearchDecimal
    iv_source: Literal["entered", "calibrated"]
    intrinsic_value: ResearchDecimal
    extrinsic_value: ResearchDecimal
    entry_value: ResearchDecimal
    current_value: ResearchDecimal
    model_value: ResearchDecimal
    profit_loss: ResearchDecimal


class ResearchFinding(DomainModel):
    code: str
    severity: Literal["info", "caution", "danger"]
    title: str
    detail: str


class ResearchSizing(DomainModel):
    risk_budget: ResearchDecimal | None
    risk_per_position: ResearchDecimal | None
    max_position_units: int | None
    fits_budget: bool | None
    budget_used_percent: ResearchDecimal | None


class ManualResearchAnalysis(DomainModel):
    symbol: str
    valuation_date: date
    spot: ResearchDecimal
    legs: tuple[ManualPositionLeg, ...]
    leg_breakdown: tuple[ResearchLegBreakdown, ...]
    requested_horizon_days: int
    horizon_days: int
    horizon_date: date
    expiration_date: date | None
    net_entry_value: ResearchDecimal
    current_value: ResearchDecimal
    current_model_value: ResearchDecimal
    current_profit_loss: ResearchDecimal
    total_fees: ResearchDecimal
    modeled_greeks: ResearchGreeks
    max_profit: ResearchDecimal | None
    max_profit_bounded: bool | None
    max_loss: ResearchDecimal | None
    max_loss_bounded: bool | None
    break_even_prices: tuple[ResearchDecimal, ...]
    reward_risk_ratio: ResearchDecimal | None
    payoff_points: tuple[ResearchPayoffPoint, ...]
    horizon_points: tuple[ResearchPayoffPoint, ...]
    scenarios: tuple[ResearchScenario, ...]
    timeline: tuple[ResearchScenarioSlice, ...]
    findings: tuple[ResearchFinding, ...]
    sizing: ResearchSizing
    assumptions: tuple[str, ...]
