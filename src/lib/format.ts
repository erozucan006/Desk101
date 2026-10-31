export function decimalsFor(p: number): number {
  const a = Math.abs(p);
  if (a >= 1000) return 2;
  if (a >= 1) return a >= 10 ? 2 : 4;
  if (a >= 0.01) return 5;
  return 8;
}

export function price(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "—";
  const d = decimalsFor(p);
  return p.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function pct(x: number | null | undefined, digits = 2): string {
  if (x == null || !isFinite(x)) return "—";
  return (x >= 0 ? "+" : "") + x.toFixed(digits) + "%";
}

export function compact(x: number | null | undefined): string {
  if (x == null || !isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (x / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (x / 1e3).toFixed(1) + "k";
  return x.toFixed(0);
}

export function money(v: number | null | undefined, sym = "$"): string {
  if (v == null || !isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "−" : v > 0 ? "+" : "") + sym + s;
}

export const ccySymbol = (q: string) => (q === "EUR" ? "€" : "$");

export function timeHMS(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function duration(fromIso: string, to = Date.now()): string {
  const m = Math.max(0, (to - Date.parse(fromIso)) / 60000);
  if (m < 60) return Math.round(m) + "m";
  if (m < 1440) return (m / 60).toFixed(1) + "h";
  return (m / 1440).toFixed(1) + "d";
}
