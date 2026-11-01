import { describe, expect, it } from "vitest";
import { EVENTS, refPeriod } from "./calendar";
import { reactionFrom, resultFor, type MacroData, type Obs } from "./macro";
// @ts-expect-error plain JS serverless module
import { parseEcbCsv, parseFred, parseJsonStat } from "../../api/macro.js";

const monthly = (from: string, values: number[]): Obs[] => values.map((v, i) => {
  const [y, m] = from.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + i, 1));
  return { d: t.toISOString().slice(0, 10), v };
});
const ev = (id: string) => EVENTS.find((e) => e.id === id)!;
const NOW = Date.parse("2026-11-01T12:00:00Z");

describe("reference periods", () => {
  it("maps release dates to the month or quarter they describe", () => {
    expect(refPeriod("cpi", "2027-01-13", "Dec")).toBe("2026-12-01");
    expect(refPeriod("nfp", "2026-11-06", "Oct")).toBe("2026-10-01");
    expect(refPeriod("gdp", "2026-10-29", "Q3 2026")).toBe("2026-07-01");
    expect(refPeriod("fomc", "2026-10-28")).toBe("2026-10-28");
  });
});

describe("results", () => {
  // CPI index rising 0.25%/month for 14 months then 0.4% in Sep 2026
  const idx = [100]; for (let i = 1; i < 21; i++) idx.push(idx[i - 1] * (i === 20 ? 1.004 : 1.0025));
  const data: MacroData = {
    updated: NOW, fred: "ok", errors: [],
    series: {
      cpi: monthly("2025-01", idx), cpi_core: monthly("2025-01", idx),
      payrolls: monthly("2026-06", [160000, 160120, 160200, 160342]),
      unrate: monthly("2026-06", [4.2, 4.2, 4.3, 4.3]),
      earnings: monthly("2025-07", Array.from({ length: 15 }, (_, i) => 35 + i * 0.1)),
      fed_lower: [{ d: "2026-09-01", v: 3.75 }, { d: "2026-10-29", v: 3.5 }],
      fed_upper: [{ d: "2026-09-01", v: 4.0 }, { d: "2026-10-29", v: 3.75 }, { d: "2026-10-31", v: 3.75 }],
      ecb_dfr: [{ d: "2026-06-17", v: 2.25 }, { d: "2026-09-16", v: 2.5 }],
      hicp: monthly("2026-08", [3.2, 3.7]),
    },
  };

  it("CPI: year-on-year with previous month and direction", () => {
    const r = resultFor(ev("cpi-2026-10-14-08:30"), data, NOW);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.headline).toBe("3.2% y/y");
    expect(r.lines[0]).toMatchObject({ value: "3.2%", prev: "3.0%", dir: "up" });
    expect(r.lines[2].value).toBe("0.4%");
  });

  it("NFP: jobs change in thousands and unemployment", () => {
    const r = resultFor(ev("nfp-2026-10-02-08:30"), data, NOW);
    expect(r.status === "ok" && r.lines[0]).toMatchObject({ value: "+142k", prev: "+80k", dir: "up" });
    expect(r.status === "ok" && r.lines[1]).toMatchObject({ value: "4.3%", dir: "flat" });
  });

  it("FOMC: detects a 25 bp cut from the target range", () => {
    const r = resultFor(ev("fomc-2026-10-28-14:00"), data, NOW);
    expect(r).toMatchObject({ status: "ok", headline: "Cut 25 bp" });
    expect(r.status === "ok" && r.lines[0].value).toBe("3.50%–3.75%");
  });

  it("ECB: unchanged when no new rate took effect within the week", () => {
    const r = resultFor(ev("ecb-2026-10-29-14:15"), data, Date.parse("2026-11-09T12:00:00Z"));
    expect(r).toMatchObject({ status: "ok", headline: "Held rates" });
    expect(resultFor(ev("ecb-2026-10-29-14:15"), data, NOW).status).toBe("pending");
  });

  it("is pending while the source has not caught up, upcoming before the release, and flags a missing key", () => {
    expect(resultFor(ev("hicp-2026-10-02-11:00"), data, NOW)).toMatchObject({ status: "ok", headline: "3.7% y/y" });
    expect(resultFor(ev("pce-2026-10-29-08:30"), data, NOW).status).toBe("pending");
    expect(resultFor(ev("cpi-2026-11-10-08:30"), data, NOW).status).toBe("upcoming");
    expect(resultFor(ev("cpi-2026-10-14-08:30"), { ...data, fred: "missing-key" }, NOW).status).toBe("no-key");
    expect(resultFor(ev("hicp-2026-10-02-11:00"), { ...data, fred: "missing-key" }, NOW).status).toBe("ok");
  });

  it("market reaction in percent", () => {
    const r = reactionFrom(100, 99, 101.5);
    expect(r.ch5).toBeCloseTo(-1);
    expect(r.ch60).toBeCloseTo(1.5);
  });
});

describe("server parsers", () => {
  it("parses FRED, ECB CSV and Eurostat JSON-stat", () => {
    expect(parseFred({ observations: [{ date: "2026-09-01", value: "3.1" }, { date: "2026-08-01", value: "." }] })).toEqual([{ d: "2026-09-01", v: 3.1 }]);
    expect(parseEcbCsv("KEY,FREQ,TIME_PERIOD,OBS_VALUE,OBS_STATUS\r\nFM.B,B,2026-09-16,2.5,A\r\nFM.B,B,2026-06-17,2.25,A")).toEqual([{ d: "2026-06-17", v: 2.25 }, { d: "2026-09-16", v: 2.5 }]);
    expect(parseJsonStat({ value: { 0: 3.2, 1: 3.7 }, dimension: { time: { category: { index: { "2026-08": 0, "2026-09": 1 } } } } })).toEqual([{ d: "2026-08-01", v: 3.2 }, { d: "2026-09-01", v: 3.7 }]);
  });
});
