// Angka dashboard: periode ini vs periode sebelumnya (hari / 7 hari / 30 hari, WIB), grafik harian, dan pelanggan
// Tempel link yang segera habis. Dipakai halaman Ringkasan dan rekap AI.
import { admin } from "./_lib";

const DAY = 86_400_000;
const WIB = 7 * 3_600_000;
const SPAN = { day: 1, week: 7, month: 30 } as const;
export type Period = keyof typeof SPAN;

// Awal periode (00:00 WIB) dan periode sebelumnya dengan panjang yang sama, sampai jam yang sama
export function periodRange(period: Period, now = Date.now()) {
  const today = Math.floor((now + WIB) / DAY) * DAY - WIB;
  const from = today - (SPAN[period] - 1) * DAY;
  const len = SPAN[period] * DAY;
  return { from: new Date(from), to: new Date(now), prevFrom: new Date(from - len), prevTo: new Date(now - len) };
}

export async function overview(period: Period) {
  const r = periodRange(period);
  const db = admin();
  const [cur, prev, daily, expiring] = await Promise.all([
    db.rpc("admin_overview", { p_from: r.from.toISOString(), p_to: r.to.toISOString() }),
    db.rpc("admin_overview", { p_from: r.prevFrom.toISOString(), p_to: r.prevTo.toISOString() }),
    db.rpc("admin_daily", { p_days: 30 }),
    db.rpc("admin_paste_expiring", { p_days: 7 }),
  ]);
  for (const x of [cur, prev, daily, expiring]) if (x.error) throw x.error;
  return { period, range: r, current: cur.data, previous: prev.data, daily: daily.data, expiring: expiring.data };
}
