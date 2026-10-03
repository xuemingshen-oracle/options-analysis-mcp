export const WORKBENCH_STORAGE_KEY = "option-atlas.workbench.v1";
export const BACKUP_FORMAT = "option-atlas-workbench";
export const MAX_BACKUP_BYTES = 5_000_000;

export type LegKind = "call" | "put" | "stock";

export interface WorkbenchLeg {
  id: string;
  kind: LegKind;
  action: "buy" | "sell";
  quantity: string;
  strike: string;
  expiration: string;
  entryPrice: string;
  currentMark: string;
  volatility: string;
  multiplier: string;
}

export interface TradePlan {
  thesis: string;
  invalidation: string;
  profitTarget: string;
  lossLimit: string;
  reviewDate: string;
  notes: string;
}

export interface WorkbenchSetup {
  name: string;
  symbol: string;
  spot: string;
  valuationDate: string;
  rate: string;
  dividendYield: string;
  fees: string;
  horizonDays: string;
  roadmapDates: string;
  ivShift: string;
  moveRange: string;
  lossBudget: string;
  calibrateIv: boolean;
  isExample: boolean;
  legs: WorkbenchLeg[];
  plan: TradePlan;
}

export interface SavedSetup {
  id: string;
  updatedAt: string;
  setup: WorkbenchSetup;
}

export interface WorkbenchState {
  current: WorkbenchSetup;
  saved: SavedSetup[];
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function dateAfter(date: string, days: number): string {
  let value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime()))
    value = new Date(`${today()}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function newId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export function blankPlan(): TradePlan {
  return {
    thesis: "",
    invalidation: "",
    profitTarget: "",
    lossLimit: "",
    reviewDate: "",
    notes: "",
  };
}

export function newLeg(date: string, kind: LegKind = "call"): WorkbenchLeg {
  return {
    id: newId(),
    kind,
    action: "buy",
    quantity: kind === "stock" ? "100" : "1",
    strike: "100",
    expiration: dateAfter(date, 45),
    entryPrice: "",
    currentMark: "",
    volatility: "25",
    multiplier: kind === "stock" ? "1" : "100",
  };
}

export type ExampleName =
  "vertical" | "condor" | "covered" | "calendar" | "butterfly_put";

export function exampleSetup(
  example: ExampleName = "vertical",
  date = today(),
): WorkbenchSetup {
  const option = (
    kind: LegKind,
    action: "buy" | "sell",
    strike: string,
    entry: string,
    current: string,
    days = 45,
  ): WorkbenchLeg => ({
    ...newLeg(date, kind),
    action,
    strike,
    entryPrice: entry,
    currentMark: current,
    expiration: dateAfter(date, days),
  });
  const setups: Record<
    ExampleName,
    { name: string; legs: WorkbenchLeg[]; thesis: string }
  > = {
    vertical: {
      name: "Bull call spread",
      legs: [
        option("call", "buy", "100", "4.20", "3.75"),
        option("call", "sell", "110", "1.30", "1.15"),
      ],
      thesis: "Example: a moderate rise toward $110 before expiration.",
    },
    condor: {
      name: "Iron condor",
      legs: [
        option("put", "buy", "85", "0.25", "0.25"),
        option("put", "sell", "90", "0.70", "0.65"),
        option("call", "sell", "110", "1.30", "1.15"),
        option("call", "buy", "115", "0.55", "0.50"),
      ],
      thesis:
        "Example: price remains between the short strikes while time passes.",
    },
    covered: {
      name: "Covered call",
      legs: [
        option("stock", "buy", "", "96", "100"),
        option("call", "sell", "110", "1.30", "1.15"),
      ],
      thesis:
        "Example: willing to sell 100 shares at $110; accept downside stock exposure.",
    },
    calendar: {
      name: "Call calendar",
      legs: [
        option("call", "sell", "100", "2.60", "2.35", 21),
        option("call", "buy", "100", "5.20", "4.70", 75),
      ],
      thesis:
        "Example: price stays near $100 through the short option's expiration.",
    },
    butterfly_put: {
      name: "Butterfly + short put",
      legs: [
        option("call", "buy", "80", "24", "24"),
        { ...option("call", "sell", "100", "11", "10"), quantity: "2" },
        option("call", "buy", "120", "4", "3"),
        option("put", "sell", "70", "3", "2"),
      ],
      thesis:
        "Example: a butterfly targeting $100, partly funded by a short put. The small debit hides substantial downside below $70.",
    },
  };
  const selected = setups[example];
  return {
    name: selected.name,
    symbol: "XYZ",
    spot: "100",
    valuationDate: date,
    rate: "4",
    dividendYield: "0",
    fees: "0",
    horizonDays: "14",
    roadmapDates: "",
    ivShift: "0",
    moveRange: "20",
    lossBudget: "1000",
    calibrateIv: false,
    isExample: true,
    legs: selected.legs,
    plan: {
      ...blankPlan(),
      thesis: selected.thesis,
      reviewDate: dateAfter(date, 7),
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid backup structure.");
  return value as Record<string, unknown>;
}

function textField(value: unknown, max = 100): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("A backup field is missing or too long.");
  return value;
}

function numericField(value: unknown): string {
  const text = textField(value, 40);
  if (text !== "" && !Number.isFinite(Number(text)))
    throw new Error("A backup contains an invalid number.");
  return text;
}

function dateField(value: unknown, optional = false): string {
  const text = textField(value, 10);
  if (optional && text === "") return text;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    !Number.isFinite(Date.parse(`${text}T12:00:00Z`)) ||
    new Date(`${text}T12:00:00Z`).toISOString().slice(0, 10) !== text
  ) {
    throw new Error("A backup contains an invalid date.");
  }
  return text;
}

export function validateSetup(value: unknown): WorkbenchSetup {
  const data = object(value);
  const plan = object(data.plan);
  if (!Array.isArray(data.legs) || data.legs.length > 30)
    throw new Error("A setup can contain at most 30 legs.");
  const legs = data.legs.map((value): WorkbenchLeg => {
    const leg = object(value);
    if (leg.kind !== "call" && leg.kind !== "put" && leg.kind !== "stock")
      throw new Error("Unknown leg type in backup.");
    if (leg.action !== "buy" && leg.action !== "sell")
      throw new Error("Unknown leg action in backup.");
    return {
      id: textField(leg.id),
      kind: leg.kind,
      action: leg.action,
      quantity: numericField(leg.quantity),
      strike: numericField(leg.strike),
      expiration: dateField(leg.expiration, true),
      entryPrice: numericField(leg.entryPrice),
      currentMark: numericField(leg.currentMark),
      volatility: numericField(leg.volatility),
      multiplier: numericField(leg.multiplier),
    };
  });
  if (new Set(legs.map((leg) => leg.id)).size !== legs.length)
    throw new Error("Duplicate leg identifiers in backup.");
  return {
    name: textField(data.name, 80),
    symbol: textField(data.symbol, 20),
    spot: numericField(data.spot),
    valuationDate: dateField(data.valuationDate, true),
    rate: numericField(data.rate),
    dividendYield: numericField(data.dividendYield),
    fees: numericField(data.fees),
    horizonDays: numericField(data.horizonDays),
    roadmapDates:
      data.roadmapDates === undefined ? "" : textField(data.roadmapDates, 150),
    ivShift: numericField(data.ivShift),
    moveRange: numericField(data.moveRange),
    lossBudget: numericField(data.lossBudget),
    calibrateIv: data.calibrateIv === true,
    isExample: data.isExample === true,
    legs,
    plan: {
      thesis: textField(plan.thesis, 4000),
      invalidation: textField(plan.invalidation, 4000),
      profitTarget: numericField(plan.profitTarget),
      lossLimit: numericField(plan.lossLimit),
      reviewDate: dateField(plan.reviewDate, true),
      notes: textField(plan.notes, 8000),
    },
  };
}

function validateSavedSetup(item: unknown): SavedSetup {
  const row = object(item);
  const updatedAt = textField(row.updatedAt, 40);
  if (!Number.isFinite(Date.parse(updatedAt)))
    throw new Error("Invalid saved-setup timestamp.");
  return { id: textField(row.id), updatedAt, setup: validateSetup(row.setup) };
}

export function parseBackup(raw: string): WorkbenchState {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
    throw new Error("Backup exceeds the 5 MB limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Choose a valid Option Atlas JSON backup.");
  }
  const value = object(parsed);
  if (value.format !== BACKUP_FORMAT || value.version !== 1)
    throw new Error("This is not a supported Option Atlas backup.");
  if (!Array.isArray(value.saved) || value.saved.length > 50)
    throw new Error("A backup can contain at most 50 saved setups.");
  const saved = value.saved.map(validateSavedSetup);
  if (new Set(saved.map((row) => row.id)).size !== saved.length)
    throw new Error("Duplicate saved-setup identifiers in backup.");
  return { current: validateSetup(value.current), saved };
}

export function serializeBackup(state: WorkbenchState): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      ...state,
    },
    null,
    2,
  );
}

export function loadWorkbench(
  storage: Pick<Storage, "getItem">,
): WorkbenchState {
  try {
    const raw = storage.getItem(WORKBENCH_STORAGE_KEY);
    if (raw) {
      try {
        return parseBackup(raw);
      } catch {
        // Recover independent saved positions if only the autosaved draft was
        // damaged, instead of replacing the entire library with an example.
        if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
          throw new Error("Oversized browser state.");
        const data = object(JSON.parse(raw));
        if (data.format !== BACKUP_FORMAT || data.version !== 1)
          throw new Error("Unknown state format.");
        let current: WorkbenchSetup;
        try {
          current = validateSetup(data.current);
        } catch {
          current = exampleSetup();
        }
        const saved = Array.isArray(data.saved)
          ? data.saved.slice(0, 50).flatMap((row) => {
              try {
                return [validateSavedSetup(row)];
              } catch {
                return [];
              }
            })
          : [];
        return {
          current,
          saved: [...new Map(saved.map((row) => [row.id, row])).values()],
        };
      }
    }
  } catch {
    /* A malformed or inaccessible local draft must not prevent startup. */
  }
  return { current: exampleSetup(), saved: [] };
}

export function saveNamedSetup(
  setup: WorkbenchSetup,
  saved: SavedSetup[],
  now = new Date().toISOString(),
): SavedSetup[] {
  const name = setup.name.trim();
  if (!name) throw new Error("Name this setup before saving it.");
  const existing = saved.find(
    (row) => row.setup.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (!existing && saved.length >= 50)
    throw new Error(
      "You have 50 saved setups. Export a backup and remove one to make room.",
    );
  return [
    { id: existing?.id ?? newId(), updatedAt: now, setup: { ...setup, name } },
    ...saved.filter((row) => row.id !== existing?.id),
  ];
}

export function mergeSavedSetups(
  existing: SavedSetup[],
  incoming: SavedSetup[],
): SavedSetup[] {
  const merged = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) {
    const current = merged.get(row.id);
    if (!current || Date.parse(row.updatedAt) > Date.parse(current.updatedAt))
      merged.set(row.id, row);
  }
  if (merged.size > 50)
    throw new Error(
      "Import would exceed 50 saved setups. Export your current library and remove some setups first.",
    );
  return [...merged.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
