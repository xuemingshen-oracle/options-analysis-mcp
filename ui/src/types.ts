export type DecimalValue = string | number;
export type PutCall = "call" | "put";

export interface ErrorDetail {
  category: string;
  message: string;
  retryable: boolean;
  reauthorization_required: boolean;
  field_paths: string[];
}

export interface OptionTerms {
  underlying_symbol: string;
  expiration_date: string;
  put_call: PutCall;
  strike: DecimalValue;
  multiplier: DecimalValue;
  is_adjusted?: boolean | null;
  deliverables?: string[];
}

export interface Instrument {
  asset_type: string;
  symbol: string;
  provider_id: string;
  provider_symbol: string;
  option: OptionTerms | null;
}

export interface Greeks {
  delta: DecimalValue | null;
  gamma: DecimalValue | null;
  theta: DecimalValue | null;
  vega: DecimalValue | null;
  rho: DecimalValue | null;
}

export interface DataQualityWarning {
  code: string;
  message: string;
  fields: string[];
}

export interface FieldProvenance {
  kind: "provider" | "local_calculation" | "user_input";
  provider_id: string | null;
  as_of: string;
  method: string | null;
}

export interface Quote {
  instrument: Instrument;
  provider_id: string;
  as_of: string;
  received_at: string;
  bid: DecimalValue | null;
  ask: DecimalValue | null;
  last: DecimalValue | null;
  mark: DecimalValue | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: DecimalValue | null;
  greeks: Greeks | null;
  field_provenance?: Record<string, FieldProvenance>;
  warnings: DataQualityWarning[];
}

export interface OptionChain {
  provider_id: string;
  underlying_symbol: string;
  as_of: string;
  underlying_quote: Quote | null;
  contracts: Quote[];
  warnings: DataQualityWarning[];
}

export interface WorkspaceSnapshot {
  provider_id: string;
  symbol: string;
  quote: Quote;
  expirations: string[];
  chain: OptionChain;
}

export interface WorkspaceResult {
  workspace: WorkspaceSnapshot | null;
  error: ErrorDetail | null;
}

export type HistoryResolution = "1m" | "5m" | "1d" | "1w" | "1mo";

export interface PriceBar {
  provider_id: string;
  instrument: Instrument;
  start: string;
  end: string;
  open: DecimalValue;
  high: DecimalValue;
  low: DecimalValue;
  close: DecimalValue;
  volume: number | null;
}

export type IndicatorChartRole =
  | "price_overlay"
  | "lower_panel"
  | "event_markers";

export interface TechnicalIndicatorPoint {
  timestamp: string;
  value: DecimalValue;
}

export interface TechnicalIndicatorSeries {
  indicator_id: string;
  spec: string;
  display_name: string;
  chart_role: IndicatorChartRole;
  value_unit: "price" | "percent" | "unitless";
  parameters: Record<string, string | number | boolean | null>;
  source_fields: string[];
  points: TechnicalIndicatorPoint[];
}

export interface PriceHistorySnapshot {
  provider_id: string;
  symbol: string;
  resolution: HistoryResolution;
  start: string;
  end: string;
  bars: PriceBar[];
  indicators: TechnicalIndicatorSeries[];
  truncated: boolean;
}

export interface PriceHistoryResult {
  history: PriceHistorySnapshot | null;
  error: ErrorDetail | null;
}

export interface WatchlistItem {
  symbol: string;
  created_at: string;
  sort_order: number;
}

export interface WatchlistResult {
  items: WatchlistItem[];
  error: ErrorDetail | null;
}

export interface StrategyLegRole {
  label: string;
  asset_type: string;
  action: "buy" | "sell";
  ratio: DecimalValue;
  put_call: PutCall | null;
  strike_order: number | null;
  expiration_order: number | null;
}

export interface StrategyTemplate {
  template_id: string;
  display_name: string;
  description: string;
  outlook: "bullish" | "bearish" | "neutral" | "volatile" | "custom";
  same_expiration: boolean;
  legs: StrategyLegRole[];
}

export interface StrategyCatalogResult {
  strategies: StrategyTemplate[];
  error: ErrorDetail | null;
}

export interface StrategyDraftLeg {
  symbol: string;
  provider_symbol: string;
  asset_type: string;
  quantity: DecimalValue;
  average_open_price: DecimalValue | null;
}

export interface StrategyDraftDefinition {
  name: string;
  underlying_symbol: string;
  provider_id: string;
  strategy_template_id: string | null;
  legs: StrategyDraftLeg[];
}

export interface StrategyDraft extends StrategyDraftDefinition {
  draft_id: string;
  created_at: string;
  updated_at: string;
}

export interface StrategyDraftResult {
  draft: StrategyDraft | null;
  error: ErrorDetail | null;
}

export interface StrategyDraftListResult {
  drafts: StrategyDraft[];
  error: ErrorDetail | null;
}

export interface AnalysisRequestLeg {
  symbol: string;
  asset_type: string;
  quantity: DecimalValue;
  average_open_price: DecimalValue | null;
}

export interface GreekExposure {
  value: DecimalValue;
  complete: boolean;
  missing_symbols: string[];
}

export interface PositionAnalysis {
  provider_id: string;
  valuation_mode: string;
  positions: Array<{
    instrument: Instrument;
    quantity: DecimalValue;
    average_open_price: DecimalValue | null;
    current_quote: Quote | null;
    market_value: DecimalValue | null;
    cost_basis: DecimalValue | null;
  }>;
  underlying_symbol: string | null;
  underlying_price: DecimalValue | null;
  net_market_value: DecimalValue | null;
  net_cost_basis: DecimalValue | null;
  aggregate_greeks: {
    delta: GreekExposure;
    gamma: GreekExposure;
    theta: GreekExposure;
    vega: GreekExposure;
    rho: GreekExposure;
  };
  expiration_date: string | null;
  payoff_points: Array<{
    underlying_price: DecimalValue;
    position_value: DecimalValue;
    profit_loss: DecimalValue | null;
  }>;
  break_even_prices: DecimalValue[];
  max_profit: DecimalValue | null;
  max_profit_bounded: boolean | null;
  max_loss: DecimalValue | null;
  max_loss_bounded: boolean | null;
  scenarios: Array<{
    underlying_price: DecimalValue;
    underlying_change: DecimalValue;
    estimated_profit_loss: DecimalValue | null;
    method: string;
  }>;
  assumptions: string[];
  warnings: DataQualityWarning[];
}

export interface PositionAnalysisResult {
  analysis: PositionAnalysis | null;
  error: ErrorDetail | null;
}
