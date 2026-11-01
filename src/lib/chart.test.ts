import { describe, expect, it } from "vitest";
import { niceStep, viewWindow } from "../components/Chart";

describe("chart view window", () => {
  it("shows the latest candles by default and clamps zoom", () => {
    expect(viewWindow(720, 150, 0)).toEqual({ from: 570, to: 720, cnt: 150, end: 0 });
    expect(viewWindow(720, 5, 0).cnt).toBe(20); // minimum zoom
    expect(viewWindow(720, 5000, 0)).toMatchObject({ from: 0, cnt: 720 });
    expect(viewWindow(10, 150, 0)).toMatchObject({ from: 0, to: 10, cnt: 10 });
  });
  it("pans into history but not past the first or last candle", () => {
    expect(viewWindow(720, 150, 100)).toMatchObject({ from: 470, to: 620 });
    expect(viewWindow(720, 150, 10_000)).toMatchObject({ from: 0, to: 150, end: 570 });
    expect(viewWindow(720, 150, -5).end).toBe(0);
  });
});

describe("axis steps", () => {
  it("picks round numbers", () => {
    expect(niceStep(3000, 6)).toBe(500);
    expect(niceStep(12, 6)).toBe(2);
    expect(niceStep(0.0009, 6)).toBeCloseTo(0.0002);
  });
});
