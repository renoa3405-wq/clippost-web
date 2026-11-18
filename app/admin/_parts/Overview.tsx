"use client";

// Ringkasan (CEO overview) + rekap harian/mingguan/bulanan. Angka dari RPC admin_overview / admin_daily.
// Akun tes pemilik tidak dihitung. Angka yang belum tercatat untuk suatu periode ditulis "belum tercatat", bukan 0.
import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, btn, fmt, fmtDay, num, rupiah, useApi } from "./ui";

type Period = "day" | "week" | "month";
export type Tab = "overview" | "sales" | "buyers" | "support" | "todos" | "broadcast" | "ai" | "update";
type Stats = Record<string, number> & { revenue_by_kind: Record<string, number>; count_by_kind: Record<string, number>; orders_since: string | null; activity_since: string };
type Daily = { day: string; new_users: number; active_users: number | null; update_sold: number | null; trials: number; orders: number | null; revenue: number | null; link_jobs: number; support_in: number };
type Expiring = { email: string; until: string; last_login: string | null; phone: string | null };
type Data = { range: { from: string; prevFrom: string }; current: Stats; previous: Stats; daily: Daily[]; expiring: Expiring[] };
type Report = { id: number; period: string | null; content: string; created_at: string; cost_usd: number };

const PERIODS = [["day", "Hari ini"], ["week", "7 hari"], ["month", "30 hari"]] as const;
const PREV: Record<Period, string> = { day: "kemarin di jam yang sama", week: "7 hari sebelumnya", month: "30 hari sebelumnya" };
const METRICS = [
  ["revenue", "Pendapatan"], ["update_sold", "New Update terjual"], ["orders", "Order"], ["trials", "Uji coba dimulai"],
  ["active_users", "Pengguna aktif"], ["new_users", "Pembeli baru terdaftar"], ["link_jobs", "Tempel link diproses"], ["support_in", "Chat Bantuan masuk"],
] as const;
type Metric = (typeof METRICS)[number][0];
export const KIND: Record<string, string> = { pro: "Pro", basic: "Basic", update: "New Update", paste_link: "Tempel link", lain: "Lainnya" };

export function Overview({ password, go }: { password: string; go: (t: Tab) => void }) {
  const api = useApi(password);
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<Data | null>(null);
  const [todos, setTodos] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([api<Data>(`/api/admin/overview?period=${period}`), api<{ todos: { priority: string }[] }>("/api/admin/todos")]);
      setData(d); setTodos(t.todos.length); setErr(null); setUpdated(new Date());
    } catch (e) { setErr((e as Error).message); }
  }, [api, period]);
  // Realtime ringan: muat ulang tiap 60 detik selama tab terbuka
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, [load]);

  const c = data?.current, p = data?.previous;
  // Apakah data order / aktivitas sudah tercatat penuh sejak awal periode ini dan periode sebelumnya
  const ordersFrom = c?.orders_since ? new Date(c.orders_since) : null;
  const curOrdersOk = !!data && !!ordersFrom && ordersFrom <= new Date(data.range.from);
  const prevOrdersOk = !!data && !!ordersFrom && ordersFrom <= new Date(data.range.prevFrom);
  const actFrom = c ? new Date(c.activity_since + "T00:00:00+07:00") : null;
  const curActOk = !!data && !!actFrom && actFrom <= new Date(data.range.from);
  const prevActOk = !!data && !!actFrom && actFrom <= new Date(data.range.prevFrom);
  const ordersNote = ordersFrom ? `tercatat sejak ${fmt(c!.orders_since)}` : "belum ada order tercatat";

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} />
        <span className="text-xs text-slate-500">Dibanding {PREV[period]} · diperbarui {updated ? updated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "…"}</span>
        <button onClick={() => void load()} className="ml-auto text-xs text-slate-500 underline">Muat ulang</button>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}{/admin_|function|relation|column/.test(err) ? " — jalankan dulu SQL dashboard terbaru di Supabase." : ""}</p>}

      {c && (
        <section className="rounded-2xl bg-gradient-to-br from-[#0B2A5B] to-[#1A73E8] p-5 text-white shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">Perlu tindakan sekarang</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Action n={c.support_waiting} label="pembeli menunggu balasan" cta="Balas di Bantuan" onClick={() => go("support")} />
            <Action n={todos ?? 0} label="to-do belum selesai" cta="Buka To-do" onClick={() => go("todos")} />
            <Action n={c.paste_expiring_7d} label="Tempel link habis ≤ 7 hari" cta="Lihat daftar" onClick={() => document.getElementById("expiring")?.scrollIntoView({ behavior: "smooth" })} />
            <Action n={c.old_pro_unpaid} label="Pro lama belum New Update" cta="Broadcast" onClick={() => go("broadcast")} />
          </div>
        </section>
      )}

      <Group title="Penjualan" note={ordersNote}>
        <Tile label="Pendapatan" value={curOrdersOk || c?.revenue ? rupiah(c?.revenue) : "—"} partial={!!c && !curOrdersOk} delta={prevOrdersOk ? delta(c?.revenue, p?.revenue, true) : undefined}
          note={c && Object.keys(c.revenue_by_kind ?? {}).length ? Object.entries(c.revenue_by_kind).map(([k, v]) => `${KIND[k] ?? k} ${rupiah(v)}`).join(" · ") : undefined} />
        <Tile label="New Update terjual" value={num(c?.update_sold)} partial={!!c && !curOrdersOk} delta={prevOrdersOk ? delta(c?.update_sold, p?.update_sold) : undefined} note="dari order Lynk" />
        <Tile label="Order" value={num(c?.orders)} partial={!!c && !curOrdersOk} delta={prevOrdersOk ? delta(c?.orders, p?.orders) : undefined}
          note={c && Object.keys(c.count_by_kind ?? {}).length ? Object.entries(c.count_by_kind).map(([k, v]) => `${KIND[k] ?? k} ${v}`).join(" · ") : undefined} />
        <Tile label="Perpanjangan" value={num(c?.renewals)} partial={!!c && !curOrdersOk} note="Basic / Tempel link dibeli ulang" />
      </Group>
      {c && !curOrdersOk && (
        <p className="-mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          ⚠ Order sebelum {ordersFrom ? fmt(c.orders_since) : "dashboard aktif"} belum ada di sini, jadi angka penjualan periode ini belum lengkap. Unggah ekspor Lynk di tab <button onClick={() => go("sales")} className="font-semibold underline">Penjualan</button> supaya lengkap dan tepat.
        </p>
      )}

      <Group title="Uji coba & New Update (Pro lama)">
        <Tile label="Uji coba dimulai" value={num(c?.trials_new)} delta={delta(c?.trials_new, p?.trials_new)} />
        <Tile label="Uji coba → bayar" value={c?.trials_total ? `${Math.round((c.trials_paid / c.trials_total) * 100)}%` : "—"} note={c ? `${num(c.trials_paid)} dari ${num(c.trials_total)} orang (sepanjang waktu)` : undefined} />
        <Tile label="Belum ambil New Update" value={num(c?.old_pro_unpaid)} note="Pro lama, target broadcast" />
        <Tile label="Broadcast terkirim" value={num(c?.bc_sent)} delta={delta(c?.bc_sent, p?.bc_sent)} />
      </Group>

      <Group title="Pengguna">
        <Tile label="Total pembeli" value={num(c?.total_users)} note={c ? `Pro ${num(c.pro)} · Basic aktif ${num(c.basic_active)}` : undefined} />
        <Tile label="Pembeli baru terdaftar" value={num(c?.new_users)} delta={delta(c?.new_users, p?.new_users)} />
        <Tile label="Membuka aplikasi" value={curActOk ? num(c?.active_users) : "—"} partial={!!c && !curActOk} delta={prevActOk ? delta(c?.active_users, p?.active_users) : undefined}
          note={c && !curActOk ? `tercatat mulai ${fmtDay(c.activity_since)}` : "di periode ini"} />
        <Tile label="Aktif 24 jam terakhir" value={num(c?.active_24h)} />
      </Group>

      <Group title="Tempel link & Bantuan">
        <Tile label="Tempel link aktif" value={num(c?.paste_active)} />
        <Tile label="Tempel link diproses" value={num(c?.link_jobs)} note={c?.link_jobs_failed ? `${num(c.link_jobs_failed)} gagal` : "tidak ada yang gagal"} delta={delta(c?.link_jobs, p?.link_jobs)} />
        <Tile label="Chat masuk" value={num(c?.support_in)} delta={delta(c?.support_in, p?.support_in)} />
        <Tile label="Belum dibaca" value={num(c?.support_unread)} />
      </Group>

      {data && <DailyChart rows={data.daily} />}
      <Recap password={password} period={period} />
      {data && <ExpiringList rows={data.expiring} />}
      <p className="text-center text-xs text-slate-400">Akun tes pemilik tidak dihitung di semua angka. &quot;—&quot; = belum tercatat (bukan nol).</p>
    </div>
  );
}

function Action({ n, label, cta, onClick }: { n: number; label: string; cta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl bg-white/10 p-3 text-left transition hover:bg-white/20">
      <div className="text-3xl font-semibold tabular-nums">{num(n)}</div>
      <div className="text-sm text-white/80">{label}</div>
      <div className="mt-1 text-xs font-medium text-white">{cta} →</div>
    </button>
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

function Tile({ label, value, delta: d, note, partial }: { label: string; value: string; delta?: Delta; note?: string; partial?: boolean }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-[#0B1B33]">{value}</div>
      {partial && <div className="mt-0.5 text-xs font-medium text-amber-700">⚠ belum lengkap</div>}
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
  const [metric, setMetric] = useState<Metric>("revenue");
  const [hover, setHover] = useState<number | null>(null);
  const label = METRICS.find(([k]) => k === metric)![1];
  const vals = rows.map((r) => (r[metric] === null ? null : Number(r[metric]) || 0));
  const known = vals.filter((v): v is number => v !== null);
  const max = Math.max(1, ...known);
  const show = (v: number | null) => (v === null ? "belum tercatat" : metric === "revenue" ? rupiah(v) : num(v));
  const W = 600, H = 160, step = W / Math.max(rows.length, 1), bw = Math.max(step - 2, 1);
  const total = known.reduce((a, b) => a + b, 0);
  const firstKnown = vals.findIndex((v) => v !== null);
  return (
    <Card title={`${label} per hari (30 hari)`} action={
      <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="h-9 rounded-full border px-3 text-sm">
        {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    }>
      <div className="text-xs text-slate-500">
        {known.length ? <>Total {known.length === rows.length ? "30 hari" : `sejak ${fmtDay(rows[firstKnown].day)}`}: <b className="text-[#0B1B33]">{show(total)}</b></> : "Belum ada data yang tercatat untuk angka ini."}
        {known.length > 0 && known.length < rows.length && <span> · hari sebelum {fmtDay(rows[firstKnown].day)} belum tercatat (garis putus-putus)</span>}
      </div>
      <div className="relative mt-3" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-48 w-full" role="img" aria-label={`${label} per hari`}>
          <line x1={0} x2={W} y1={H} y2={H} stroke="#E2E8F0" />
          {vals.map((v, i) => {
            const h = v ? Math.max((v / max) * (H - 8), 3) : 0, x = i * step + 1, y = H - h, r = Math.min(4, bw / 2, h);
            return (
              <g key={rows[i].day} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
                {v === null && <line x1={x + bw / 2} x2={x + bw / 2} y1={H - 30} y2={H} stroke="#CBD5E1" strokeDasharray="3 3" />}
                {h > 0 && <path d={`M${x},${H} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${H} Z`} fill={hover === i ? "#0B2A5B" : "#1A73E8"} />}
              </g>
            );
          })}
          {[0, Math.floor(rows.length / 2), rows.length - 1].filter((i) => rows[i]).map((i) => (
            <text key={i} x={Math.min(Math.max(i * step + step / 2, 18), W - 18)} y={H + 14} textAnchor="middle" fontSize="10" fill="#64748B">{fmtDay(rows[i].day)}</text>
          ))}
        </svg>
        {hover !== null && rows[hover] && (
          <div className="pointer-events-none absolute top-0 rounded-lg border bg-white px-2 py-1 text-xs shadow" style={{ left: `clamp(0px, calc(${((hover + 0.5) / rows.length) * 100}% - 50px), calc(100% - 120px))` }}>
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
              <tr key={r.day} className="border-t"><td className="py-1">{fmtDay(r.day)}</td>{METRICS.map(([k]) => <td key={k} className="px-1 text-right">{r[k] === null ? "—" : k === "revenue" ? rupiah(r[k]) : num(r[k])}</td>)}</tr>
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
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{report.content.replace(/\*\*/g, "")}</div>
          <p className="mt-3 text-xs text-slate-400">Dibuat {fmt(report.created_at)} · biaya ±${report.cost_usd.toFixed(3)} · angka di atas tetap yang paling benar; rekap AI hanya membantu membaca</p>
        </>
      ) : <p className="text-sm text-slate-500">AI membaca angka di atas lalu menulis apa yang naik/turun dan 3 tindakan berikutnya (±Rp300 per rekap).</p>}
    </Card>
  );
}

function ExpiringList({ rows }: { rows: Expiring[] }) {
  return (
    <div id="expiring">
      <Card title="Tempel link: habis dalam 7 hari (dan yang baru habis 3 hari terakhir)">
        {rows.length === 0 ? <p className="text-sm text-slate-500">Tidak ada.</p> : (
          <div className="divide-y text-sm">
            {rows.map((r) => {
              const expired = new Date(r.until) < new Date();
              const msg = `Halo kak, langganan Tempel link ClipPost kakak ${expired ? "sudah habis" : "akan habis"} ${new Date(r.until).toLocaleDateString("id-ID", { day: "numeric", month: "long" })}. Perpanjang di aplikasi: tab Akun > Tempel link > Perpanjang ya kak 🙏`;
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
    </div>
  );
}
