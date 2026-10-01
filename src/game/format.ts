const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/**
 * Compact number: 1,250 · 25.4K · 3.2M · 4.7B · 2.8T. Values under 10,000 are
 * shown in full; beyond the named suffixes we fall back to aa, ab, ac…
 */
export function formatNumber(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n < 10) return sign + (Number.isInteger(n) ? String(n) : n.toFixed(decimals === 0 ? 0 : Math.min(2, decimals + 1)).replace(/\.?0+$/, ""));
  if (n < 10_000) return sign + Math.floor(n).toLocaleString("en-US");
  const tier = Math.floor(Math.log10(n) / 3);
  const scaled = n / Math.pow(1000, tier);
  let suffix: string;
  if (tier < SUFFIXES.length) {
    suffix = SUFFIXES[tier];
  } else {
    const i = tier - SUFFIXES.length;
    suffix = String.fromCharCode(97 + Math.floor(i / 26) % 26) + String.fromCharCode(97 + (i % 26));
  }
  // Truncate rather than round so a counter never shows more than you have.
  const factor = Math.pow(10, decimals);
  const shown = Math.floor(scaled * factor) / factor;
  return sign + shown.toFixed(scaled >= 100 ? 0 : decimals).replace(/\.0+$/, "") + suffix;
}

export function formatMoney(n: number, decimals = 1): string {
  if (n < 0) return "-$" + formatNumber(-n, decimals);
  return "$" + formatNumber(n, decimals);
}

/** Money with cents-free whole numbers for small amounts ($12, not $12.4). */
export function formatCash(n: number): string {
  if (Math.abs(n) < 10) return "$" + Math.floor(n).toString();
  return formatMoney(n);
}

export function formatDuration(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTime(seconds: number): string {
  if (seconds < 1) return `${seconds.toFixed(2)}s`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return formatDuration(seconds);
}

export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  return `${pct >= 100 ? Math.round(pct).toLocaleString("en-US") : Number(pct.toFixed(1))}%`;
}

/** Time to afford `cost` at `rate`/s, or null if it will never happen. */
export function timeToAfford(cash: number, cost: number, rate: number): number | null {
  if (cash >= cost) return 0;
  if (rate <= 0) return null;
  return (cost - cash) / rate;
}

export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}
