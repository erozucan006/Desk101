// Pure indicator math. Values before an indicator has enough data are null.

export function ema(values: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1);
  let e: number | null = null;
  return values.map((v, i) => {
    if (i < n - 1) return null;
    if (e === null) {
      // seed with the simple average of the first n values
      e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
      return e;
    }
    e = v * k + e * (1 - k);
    return e;
  });
}

// Wilder's RSI
export function rsi(values: number[], n = 14): (number | null)[] {
  const out: (number | null)[] = values.map(() => null);
  if (values.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function lastValue(a: (number | null)[]): number | null {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i];
  return null;
}
