import { describe, expect, it } from "vitest";
import { fmtElapsed, noSample, type TimingStat } from "@/lib/admin";

const u = { min: "min", hr: "hr", day: "days" };

describe("fmtElapsed", () => {
  it("formats minutes below one hour", () => {
    expect(fmtElapsed(45, u)).toBe("45 min");
  });
  it("formats hours below one day", () => {
    expect(fmtElapsed(120, u)).toBe("2 hr");
  });
  it("formats days", () => {
    expect(fmtElapsed(2880, u)).toBe("2 days");
  });
  it("never treats a missing value as zero", () => {
    expect(fmtElapsed(null, u)).toBe("—");
    expect(fmtElapsed(undefined, u)).toBe("—");
    expect(fmtElapsed(Number.NaN, u)).toBe("—");
  });
  it("keeps a real zero measurement as zero", () => {
    expect(fmtElapsed(0, u)).toBe("0 min");
  });
});

describe("noSample", () => {
  it("hides averages when there is no sample", () => {
    expect(noSample(undefined)).toBe(true);
    expect(noSample(null)).toBe(true);
    expect(noSample({ avg_minutes: null, median_minutes: null, p90_minutes: null, n: 0 })).toBe(true);
  });
  it("shows stats when a sample exists", () => {
    const s: TimingStat = { avg_minutes: 12.5, median_minutes: 10, p90_minutes: 30, n: 4 };
    expect(noSample(s)).toBe(false);
  });
});
