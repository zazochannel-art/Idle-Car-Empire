import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { balance, BALANCE_RANGE, parseBalance, setBalance } from "./balance";
import { rewardCash } from "./rewards";
import type { EconomySnapshot } from "./economy";

afterEach(() => setBalance({}));

describe("economy knobs from the server", () => {
  it("are 1 until the server says otherwise", () => {
    expect(balance("rewards")).toBe(1);
    expect(balance("usedSell")).toBe(1);
    expect(balance("qc")).toBe(1);
  });

  it("take only known knobs with numbers inside their range", () => {
    expect(parseBalance({ rewards: 0.9, usedSell: 1.1, qc: 2, bogus: 5 })).toEqual({ rewards: 0.9, usedSell: 1.1, qc: 2 });
    expect(parseBalance({ rewards: 3, usedSell: 0.7, qc: 0.4 })).toEqual({});
    expect(parseBalance({ rewards: "0.9", qc: Number.NaN, usedSell: null })).toEqual({});
    expect(parseBalance(null)).toEqual({});
    expect(parseBalance([1, 2])).toEqual({});
  });

  it("scale the share-of-income rewards, and nothing else in them", () => {
    const snap = { rewardIncomePerSec: 100 } as EconomySnapshot;
    expect(rewardCash({ cash: 50, incomeSeconds: 60 }, snap)).toBe(6050);
    setBalance({ rewards: 0.5 });
    expect(rewardCash({ cash: 50, incomeSeconds: 60 }, snap)).toBe(3050);
    expect(rewardCash({ cash: 50 }, snap)).toBe(50);
  });

  it("have the ranges the server enforces", () => {
    const sql = readFileSync("supabase/migrations/0030_balance.sql", "utf8");
    const keys = [...sql.matchAll(/constraint balance_key check \(key in \(([^)]*)\)\)/g)][0][1].split(",").map((k) => k.trim().replace(/'/g, ""));
    expect(keys.sort()).toEqual(Object.keys(BALANCE_RANGE).sort());
    expect(sql).toContain("when 'usedSell' then value between 0.8 and 1.25 else value between 0.5 and 2 end");
    expect(BALANCE_RANGE.usedSell).toEqual([0.8, 1.25]);
    expect(BALANCE_RANGE.rewards).toEqual([0.5, 2]);
    expect(BALANCE_RANGE.qc).toEqual([0.5, 2]);
  });
});
