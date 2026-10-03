import { describe, expect, it } from "vitest";

import { buildResearchRequest } from "./research";
import {
  BACKUP_FORMAT,
  dateAfter,
  exampleSetup,
  loadWorkbench,
  MAX_BACKUP_BYTES,
  mergeSavedSetups,
  parseBackup,
  saveNamedSetup,
  serializeBackup,
  validateSetup,
} from "./workbenchState";

const date = "2026-10-02";

describe("workbench examples and editing state", () => {
  it.each([
    "vertical",
    "condor",
    "covered",
    "calendar",
    "butterfly_put",
  ] as const)("builds a valid independent %s example", (name) => {
    const example = exampleSetup(name, date);
    expect(example.isExample).toBe(true);
    expect(buildResearchRequest(example).legs.length).toBeGreaterThan(0);
    expect(example.symbol).toBe("XYZ");
  });

  it("demonstrates that a small debit can hide a large short-put loss", () => {
    const request = buildResearchRequest(exampleSetup("butterfly_put", date));
    const cost = request.legs.reduce(
      (sum, leg) => sum + leg.quantity * leg.multiplier * leg.entry_price,
      0,
    );
    const payoff = (spot: number) =>
      request.legs.reduce(
        (sum, leg) =>
          sum +
          leg.quantity *
            leg.multiplier *
            Math.max(
              0,
              leg.kind === "put" ? leg.strike! - spot : spot - leg.strike!,
            ),
        0,
      ) - cost;
    expect(cost).toBe(300);
    expect(payoff(0)).toBe(-7300);
    expect(payoff(100)).toBe(1700);
    expect(payoff(1000)).toBe(-300);
  });

  it("uses correct UTC date arithmetic across months and leap years", () => {
    expect(dateAfter("2028-02-28", 2)).toBe("2028-03-01");
    expect(dateAfter("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateAfter("", 7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("preserves incomplete autosaved dates and the saved library on reload", () => {
    const current = exampleSetup("vertical", date);
    const saved = saveNamedSetup(current, [], "2026-10-02T15:00:00Z");
    const partial = {
      ...current,
      valuationDate: "",
      legs: current.legs.map((leg) => ({
        ...leg,
        expiration: "",
        entryPrice: "",
      })),
    };
    const serialized = serializeBackup({ current: partial, saved });
    const loaded = loadWorkbench({ getItem: () => serialized });
    expect(loaded.current.valuationDate).toBe("");
    expect(loaded.current.legs[0].expiration).toBe("");
    expect(loaded.current.legs[0].entryPrice).toBe("");
    expect(loaded.saved).toEqual(saved);
    expect(() => buildResearchRequest(loaded.current)).toThrow(
      "valuation date",
    );
  });

  it("salvages valid saved positions when the current draft is corrupted", () => {
    const current = exampleSetup("vertical", date);
    const saved = saveNamedSetup(current, [], "2026-10-02T15:00:00Z");
    const raw = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      current: { bad: "draft" },
      saved,
    });
    expect(loadWorkbench({ getItem: () => raw }).saved).toEqual(saved);
  });

  it("starts safely when browser storage is blocked", () => {
    const loaded = loadWorkbench({
      getItem: () => {
        throw new Error("Storage unavailable");
      },
    });
    expect(loaded.current.isExample).toBe(true);
    expect(loaded.saved).toEqual([]);
  });
});

describe("named setup library and backup", () => {
  it("updates a case-insensitive name without duplicating the saved setup", () => {
    const setup = exampleSetup("vertical", date);
    const first = saveNamedSetup(setup, [], "2026-10-02T15:00:00Z");
    const next = saveNamedSetup(
      { ...setup, name: `  ${setup.name.toUpperCase()}  `, spot: "105" },
      first,
      "2026-10-03T15:00:00Z",
    );
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(first[0].id);
    expect(next[0].setup.spot).toBe("105");
    expect(first[0].setup.spot).toBe("100");
  });

  it("round trips a complete setup including optional calibration and trade plan", () => {
    const current = exampleSetup("calendar", date);
    current.calibrateIv = true;
    current.plan.invalidation = "A changed earnings outlook";
    const saved = saveNamedSetup(current, [], "2026-10-02T15:00:00Z");
    expect(parseBackup(serializeBackup({ current, saved }))).toEqual({
      current,
      saved,
    });
  });

  it("round trips the maximum library with long Unicode notebook fields", () => {
    const current = exampleSetup("condor", date);
    current.plan = {
      ...current.plan,
      thesis: "€".repeat(4000),
      invalidation: "€".repeat(4000),
      notes: "€".repeat(8000),
    };
    const saved = Array.from({ length: 50 }, (_, index) => ({
      id: `saved-${index}`,
      updatedAt: "2026-10-02T15:00:00Z",
      setup: { ...current, name: `Setup ${index}` },
    }));
    const raw = serializeBackup({ current, saved });
    expect(new TextEncoder().encode(raw).length).toBeGreaterThan(1_000_000);
    expect(new TextEncoder().encode(raw).length).toBeLessThan(MAX_BACKUP_BYTES);
    expect(parseBackup(raw).saved).toHaveLength(50);
  });

  it("rejects malformed imports and invalid calendar dates", () => {
    expect(() => parseBackup("not json")).toThrow("valid Option Atlas");
    expect(() =>
      parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 2 })),
    ).toThrow("supported");
    const invalid = {
      ...exampleSetup("vertical", date),
      valuationDate: "2027-02-30",
    };
    expect(() => validateSetup(invalid)).toThrow("invalid date");
  });

  it("rejects duplicate IDs and excessive backup contents", () => {
    const current = exampleSetup("vertical", date);
    const saved = saveNamedSetup(current, [], "2026-10-02T15:00:00Z");
    expect(() =>
      parseBackup(serializeBackup({ current, saved: [...saved, ...saved] })),
    ).toThrow("Duplicate");
    expect(() => parseBackup("x".repeat(MAX_BACKUP_BYTES + 1))).toThrow("5 MB");
  });

  it("merges backups by ID, keeps newer snapshots, and preserves other setups", () => {
    const base = {
      id: "same",
      updatedAt: "2026-10-02T15:00:00Z",
      setup: exampleSetup("vertical", date),
    };
    const newer = {
      ...base,
      updatedAt: "2026-10-03T15:00:00Z",
      setup: { ...base.setup, spot: "106" },
    };
    const other = { ...base, id: "other" };
    expect(mergeSavedSetups([base, other], [newer])).toEqual([newer, other]);
    expect(mergeSavedSetups([newer], [base])[0]).toEqual(newer);
  });
});
