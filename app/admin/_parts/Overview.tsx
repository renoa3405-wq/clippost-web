"use client";

// Ringkasan (CEO overview) + rekap harian/mingguan/bulanan. Angka dari RPC admin_overview / admin_daily.
import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, btn, fmt, fmtDay, num, rupiah, useApi } from "./ui";

type Period = "day" | "week" | "month";
type Stats = Record<string, number> & { revenue_by_kind: Record<string, number>; orders_since: string | null };
type Daily = { day: string; new_users: number; active_users: number; v7_paid: number; trials: number; orders: number; revenue: number; link_jobs: number; support_in: number };
type Expiring = { email: string; until: string; last_login: string | null; phone: string | null };
type Data = { current: Stats; previous: Stats; daily: Daily[]; expiring: Expiring[] };
type Report = { id: number; period: string | null; content: string; created_at: string; cost_usd: number };

const PERIODS = [["day", "Hari ini"], ["week", "7 hari"], ["month", "30 hari"]] as const;
const PREV: Record<Period, string> = { day: "kemarin di jam yang sama", week: "7 hari sebelumnya", month: "30 hari sebelumnya" };
const METRICS = [
  ["new_users", "Pengguna baru"], ["active_users", "Pengguna aktif"], ["v7_paid", "New Update terjual"], ["trials", "Uji coba dimulai"],
  ["revenue", "Pendapatan"], ["orders", "Order"], ["link_jobs", "Tempel link diproses"], ["support_in", "Chat Bantuan masuk"],
] as const;
type Metric = (typeof METRICS)[number][0];
const KIND: Record<string, string> = { pro: "Pro", basic: "Basic", update: "New Update", paste_link: "Tempel link", lain: "Lainnya" };

export function Overview({ password }: { password: string }) {
  const api = useApi(password);
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const load = useCallback(async () => {
    try { setData(await api<Data>(`/api/admin/overview?period=${period}`)); setErr(null); setUpdated(new Date()); } catch (e) { setErr((e as Error).message); }
  }, [api, period]);
  // Realtime ringan: muat ulang tiap 60 detik selama tab terbuka
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, [load]);

  const c = data?.current, p = data?.previous;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} />
        <span className="text-xs text-slate-500">Dibanding {PREV[period]} · diperbarui {updated ? updated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "…"} (otomatis tiap menit)</span>
        <button onClick={() => void load()} className="ml-auto text-xs text-slate-500 underline">Muat ulang</button>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}{/admin_overview|function|relation/.test(err) ? " — jalankan dulu clippost_v9_dashboard.sql di Supabase." : ""}</p>}

      <Group title="Pengguna">
        <Tile label="Total terdaftar" value={num(c?.total_users)} note={c ? `Pro ${num(c.pro)} · Basic aktif ${num(c.basic_active)}` : undefined} />
        <Tile label="Pengguna baru" value={num(c?.new_users)} delta={delta(c?.new_users, p?.new_users)} />
        <Tile label="Pengguna aktif" value={num(c?.active_users)} delta={delta(c?.active_users, p?.active_users)} note="membuka aplikasi di periode ini" />
        <Tile label="Aktif 24 jam terakhir" value={num(c?.active_24h)} />
      </Group>

      <Group title="Penjualan" note={c ? (c.orders_since ? `Order tercatat sejak ${fmt(c.orders_since)}` : "Pencatatan order dimulai setelah dashboard ini aktif; order lama menyusul dari ekspor Lynk.") : undefined}>
        <Tile label="Pendapatan" value={rupiah(c?.revenue)} delta={delta(c?.revenue, p?.revenue, true)}
          note={c && Object.keys(c.revenue_by_kind ?? {}).length ? Object.entries(c.revenue_by_kind).map(([k, v]) => `${KIND[k] ?? k} ${rupiah(v)}`).join(" · ") : undefined} />
        <Tile label="Order" value={num(c?.orders)} delta={delta(c?.orders, p?.orders)} />
        <Tile label="New Update terjual" value={num(c?.v7_paid_new)} delta={delta(c?.v7_paid_new, p?.v7_paid_new)} note={c ? `Total berhak New Update ${num(c.v7_paid_total)}` : undefined} />
        <Tile label="Perpanjangan" value={num(c?.renewals)} delta={delta(c?.renewals, p?.renewals)} note="Basic / Tempel link dibeli ulang" />
      </Group>

      <Group title="Pembeli Pro lama">
        <Tile label="Belum ambil New Update" value={num(c?.old_pro_unpaid)} note="target broadcast" />
        <Tile label="Uji coba dimulai" value={num(c?.trials_new)} delta={delta(c?.trials_new, p?.trials_new)} />
        <Tile label="Uji coba → bayar" value={c?.trials_total ? `${Math.round((c.trials_paid / c.trials_total) * 100)}%` : "—"} note={c ? `${num(c.trials_paid)} dari ${num(c.trials_total)} uji coba` : undefined} />
        <Tile label="Broadcast terkirim" value={num(c?.bc_sent)} delta={delta(c?.bc_sent, p?.bc_sent)} />
      </Group>

      <Group title="Tempel link & Bantuan">
        <Tile label="Tempel link aktif" value={num(c?.paste_active)} />
        <Tile label="Habis ≤ 7 hari" value={num(c?.paste_expiring_7d)} note="daftar di bawah" />
        <Tile label="Tempel link diproses" value={num(c?.link_jobs)} note={c?.link_jobs_failed ? `${num(c.link_jobs_failed)} gagal` : undefined} delta={delta(c?.link_jobs, p?.link_jobs)} />
        <Tile label="Chat belum dibaca" value={num(c?.support_unread)} note={c ? `${num(c.support_in)} pesan masuk periode ini` : undefined} />
      </Group>

      {data && <DailyChart rows={data.daily} />}
      <Recap password={password} period={period} />
      {data && <ExpiringList rows={data.expiring} />}
    </div>
  );
}

type Delta = { text: string; dir: 1 | -1 | 0 } | undefined;
function delta(cur: number | undefined, prev: number | undefined, money = false): Delta {
  if (cur === undefined || prev === undefined) return undefined;
  const d = cur - prev;
  const abs = money ? rupiah(Math.abs(d)) : num(Math.abs(d));
  return { text: d === 0 ? "sama" : `${d > 0 ? "+" : "−"}${abs}`, dir: d > 0 ? 1 : d < 0 ? -1 : 0 };
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>{note && <span className="text-xs text-slate-400">{note}</span>}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, delta: d, note }: { label: string; value: string; delta?: Delta; note?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-[#0B1B33]">{value}</div>
      {d && (
        <div className="mt-0.5 text-xs text-slate-500">
          <span className={d.dir > 0 ? "text-emerald-700" : d.dir < 0 ? "text-red-700" : ""}>{d.dir > 0 ? "▲" : d.dir < 0 ? "▼" : "•"} {d.text}</span> vs sebelumnya
        </div>
      )}
      {note && <div className="mt-0.5 text-xs text-slate-400">{note}</div>}
    </div>
  );
}

function DailyChart({ rows }: { rows: Daily[] }) {
  const [metric, setMetric] = useState<Metric>("active_users");
  const [hover, setHover] = useState<number | null>(null);
  const label = METRICS.find(([k]) => k === metric)![1];
  const vals = rows.map((r) => Number(r[metric]) || 0);
  const max = Math.max(1, ...vals);
  const show = (v: number) => (metric === "revenue" ? rupiah(v) : num(v));
  const W = 600, H = 160, step = W / Math.max(rows.length, 1), bw = Math.max(step - 2, 1);
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <Card title={`${label} per hari (30 hari)`} action={
      <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="h-9 rounded-full border px-3 text-sm">
        {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    }>
      <div className="text-xs text-slate-500">Total 30 hari: <b className="text-[#0B1B33]">{show(total)}</b> · tertinggi {show(max === 1 && total === 0 ? 0 : max)}</div>
      <div className="relative mt-3" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-48 w-full" role="img" aria-label={`${label} per hari`}>
          <line x1={0} x2={W} y1={H} y2={H} stroke="#E2E8F0" />
          {vals.map((v, i) => {
            const h = v ? Math.max((v / max) * (H - 8), 3) : 0, x = i * step + 1, y = H - h, r = Math.min(4, bw / 2, h);
            return (
              <g key={rows[i].day} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
                {h > 0 && <path d={`M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H} Z`} fill={hover === i ? "#0B2A5B" : "#1A73E8"} />}
              </g>
            );
          })}
          {[0, Math.floor(rows.length / 2), rows.length - 1].filter((i) => rows[i]).map((i) => (
            <text key={i} x={Math.min(Math.max(i * step + step / 2, 18), W - 18)} y={H + 14} textAnchor="middle" fontSize="10" fill="#64748B">{fmtDay(rows[i].day)}</text>
          ))}
        </svg>
        {hover !== null && rows[hover] && (
          <div className="pointer-events-none absolute top-0 rounded-lg border bg-white px-2 py-1 text-xs shadow" style={{ left: `clamp(0px, calc(${((hover + 0.5) / rows.length) * 100}% - 50px), calc(100% - 110px))` }}>
            <div className="text-slate-500">{fmtDay(rows[hover].day)}</div><div className="font-semibold">{show(vals[hover])}</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-slate-500">Lihat sebagai tabel</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Tanggal</th>{METRICS.map(([k, l]) => <th key={k} className="px-1 text-right">{l}</th>)}</tr></thead>
            <tbody>{[...rows].reverse().map((r) => (
              <tr key={r.day} className="border-t"><td className="py-1">{fmtDay(r.day)}</td>{METRICS.map(([k]) => <td key={k} className="px-1 text-right">{k === "revenue" ? rupiah(r[k]) : num(r[k])}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

function Recap({ password, period }: { password: string; period: Period }) {
  const api = useApi(password);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setReport(null);
    api<{ reports: Report[] }>("/api/admin/ai?kind=recap").then((d) => setReport(d.reports.find((r) => r.period === period) ?? null)).catch(() => {});
  }, [api, period]);
  async function make() {
    setBusy(true); setErr(null);
    try { setReport((await api<{ report: Report }>("/api/admin/ai", { kind: "recap", period })).report); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const label = PERIODS.find(([k]) => k === period)![1].toLowerCase();
  return (
    <Card title={`Rekap AI · ${label}`} action={<button disabled={busy} onClick={() => void make()} className={`h-9 ${btn}`}>{busy ? "Menulis rekap…" : report ? "Buat ulang" : "Buat rekap"}</button>}>
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      {report ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{report.content}</p>
          <p className="mt-3 text-xs text-slate-400">Dibuat {fmt(report.created_at)} · biaya ±${report.cost_usd.toFixed(3)}</p>
        </>
      ) : <p className="text-sm text-slate-500">Belum ada rekap untuk periode ini. AI membaca angka di atas lalu menulis apa yang naik/turun dan 3 tindakan berikutnya (sekitar Rp1.000–3.000 per rekap).</p>}
    </Card>
  );
}

function ExpiringList({ rows }: { rows: Expiring[] }) {
  return (
    <Card title="Tempel link: habis dalam 7 hari (dan baru habis 3 hari terakhir)">
      {rows.length === 0 ? <p className="text-sm text-slate-500">Tidak ada.</p> : (
        <div className="divide-y text-sm">
          {rows.map((r) => {
            const expired = new Date(r.until) < new Date();
            const msg = `Halo kak, langganan Tempel link ClipPost kakak ${expired ? "sudah habis" : "akan habis"} ${new Date(r.until).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}. Perpanjang di tab Akun > Tempel link > Perpanjang ya kak 🙏`;
            return (
              <div key={r.email} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.email}</div><div className="text-xs text-slate-500">{expired ? "Sudah habis" : "Habis"} {fmt(r.until)} · login terakhir {fmt(r.last_login)}</div></div>
                {r.phone ? <a href={`https://wa.me/${r.phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1 text-xs">WA {r.phone}</a> : <span className="text-xs text-slate-400">nomor belum tercatat</span>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
