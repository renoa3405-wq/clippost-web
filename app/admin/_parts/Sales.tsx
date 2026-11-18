"use client";

// Penjualan: daftar order (untuk dicocokkan dengan dashboard Lynk) dan unggah ekspor Lynk (.xlsx / .csv).
// File dibaca di browser; kolom ditebak dari judulnya dan bisa dikoreksi; pratinjau dulu sebelum disimpan.
import { useCallback, useEffect, useMemo, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { Card, btn, btnOutline, fmt, num, rupiah, useApi } from "./ui";
import { KIND } from "./Overview";

type Order = { id: number; ref_id: string | null; email: string | null; name: string | null; phone: string | null; product: string; kind: string; amount: number; source: string; created_at: string };
type Cell = string | number | boolean | Date | null;
type Field = "created_at" | "email" | "name" | "phone" | "product" | "amount" | "ref_id" | "status";
const FIELDS: [Field, string, RegExp][] = [
  ["created_at", "Tanggal", /tanggal|date|waktu|time|dibayar|paid|created/i],
  ["product", "Produk", /produk|product|item|judul|title|nama produk/i],
  ["amount", "Nominal", /grand|total|nominal|amount|jumlah|harga|price|bayar/i],
  ["email", "Email", /e-?mail/i],
  ["phone", "No. WA", /whats|wa\b|phone|telepon|telp|hp|handphone|no\.?\s*hp/i],
  ["name", "Nama pembeli", /nama|name|customer|pembeli/i],
  ["ref_id", "ID order", /ref|invoice|order\s*id|id\s*order|id\s*transaksi|kode|trx/i],
  ["status", "Status", /status/i],
];
const OK_STATUS = /success|sukses|berhasil|paid|lunas|selesai|complete|settle/i;

function guessHeader(rows: Cell[][]) {
  let best = 0, bestScore = -1;
  rows.slice(0, 15).forEach((r, i) => {
    const score = FIELDS.filter(([, , re]) => r.some((c) => typeof c === "string" && re.test(c))).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function guessMap(header: Cell[]): Record<Field, number> {
  const used = new Set<number>();
  const map = {} as Record<Field, number>;
  for (const [f, , re] of FIELDS) {
    let idx = header.findIndex((c, i) => !used.has(i) && typeof c === "string" && re.test(c) && !(f === "name" && /produk|product|item/i.test(c)));
    if (f === "amount") { const g = header.findIndex((c, i) => !used.has(i) && typeof c === "string" && /grand|total/i.test(c)); if (g >= 0) idx = g; }
    map[f] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

function toDate(v: Cell): Date | null {
  // Sel tanggal Excel dibaca sebagai jam dinding dalam UTC; jam di ekspor Lynk = WIB
  if (v instanceof Date) return new Date(v.getTime() - 7 * 3600000);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000) - 7 * 3600000); // serial Excel, anggap WIB
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  const m = /^(\d{1,2})[\/\-. ](\d{1,2}|[A-Za-z]+)[\/\-. ](\d{4})(?:[ ,T]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/.exec(s);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
    const monEn = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mo = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : Math.max(months.indexOf(m[2].slice(0, 3).toLowerCase()), monEn.indexOf(m[2].slice(0, 3).toLowerCase()));
    if (mo < 0) return null;
    const iso = `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] ?? "0").padStart(2, "0")}:${m[5] ?? "00"}:${m[6] ?? "00"}+07:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "+07:00");
  return isNaN(d.getTime()) ? null : d;
}

function toAmount(v: Cell): number | null {
  if (typeof v === "number") return Math.round(v);
  if (typeof v !== "string") return null;
  const s = v.replace(/rp|idr|\s/gi, "");
  const clean = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : /\.\d{1,2}$/.test(s) && !/\.\d{3}/.test(s) ? s.replace(/,/g, "") : s.replace(/[.,]/g, "");
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function Sales({ password }: { password: string }) {
  const api = useApi(password);
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setOrders((await api<{ orders: Order[] }>("/api/admin/orders?limit=500")).orders); } catch (e) { setErr((e as Error).message); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const total = orders.reduce((a, o) => a + o.amount, 0);
  return (
    <div className="grid gap-4">
      <Import password={password} onDone={() => void load()} />
      <Card title="Order tercatat" action={<span className="text-sm text-slate-500">{num(orders.length)} order · {rupiah(total)}{orders.length >= 500 ? " (500 terbaru)" : ""}</span>}>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <p className="mb-2 text-xs text-slate-500">Cocokkan dengan dashboard Lynk. Sumber: &quot;otomatis&quot; = dicatat webhook saat pembayaran masuk, &quot;ekspor&quot; = dari file Lynk yang diunggah.</p>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-slate-500"><tr><th className="py-1">Waktu (WIB)</th><th>Pembeli</th><th>Produk</th><th className="text-right">Nominal</th><th className="pl-2">Sumber</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t align-top">
                  <td className="py-1.5 pr-2 text-xs tabular-nums">{fmt(o.created_at)}</td>
                  <td className="pr-2"><div className="max-w-[220px] truncate">{o.email ?? "—"}</div><div className="text-xs text-slate-500">{o.name ?? ""}{o.phone ? ` · ${o.phone}` : ""}</div></td>
                  <td className="pr-2"><span className="rounded-full bg-slate-100 px-2 text-xs">{KIND[o.kind] ?? o.kind}</span><div className="max-w-[220px] truncate text-xs text-slate-500">{o.product}</div></td>
                  <td className="text-right tabular-nums">{rupiah(o.amount)}</td>
                  <td className="pl-2 text-xs text-slate-500">{o.source === "webhook" ? "otomatis" : "ekspor"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Belum ada order. Order baru tercatat otomatis; order lama dari unggah ekspor Lynk di atas.</p>}
        </div>
      </Card>
    </div>
  );
}

type Preview = { fresh: number; already: number; dupInFile: number; sribuklip: number; afterCutoff: number; invalid: number; byKind: Record<string, { n: number; amount: number }>; cutoff: string | null };

function Import({ password, onDone }: { password: string; onDone: () => void }) {
  const api = useApi(password);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [fileName, setFileName] = useState("");
  const [headerIdx, setHeaderIdx] = useState(0);
  const [map, setMap] = useState<Record<Field, number> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File) {
    setMsg(null); setPreview(null);
    try {
      let data: Cell[][];
      if (/\.csv$/i.test(f.name)) {
        const text = await f.text();
        const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
        data = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => (l.match(new RegExp(`("([^"]|"")*"|[^${sep}]*)(${sep}|$)`, "g")) ?? []).slice(0, -1).map((c) => c.replace(new RegExp(`${sep}$`), "").replace(/^"|"$/g, "").replace(/""/g, '"')));
      } else {
        data = (await readSheet(f)) as Cell[][];
      }
      const h = guessHeader(data);
      setRows(data); setFileName(f.name); setHeaderIdx(h); setMap(guessMap(data[h] ?? []));
    } catch (e) { setMsg(`File tidak bisa dibaca: ${(e as Error).message}`); }
  }

  const header = rows[headerIdx] ?? [];
  const parsed = useMemo(() => {
    if (!map) return { ok: [], skippedStatus: 0, bad: 0 };
    const ok: { ref_id: string | null; created_at: string; email: string | null; name: string | null; phone: string | null; product: string; amount: number }[] = [];
    let skippedStatus = 0, bad = 0;
    for (const r of rows.slice(headerIdx + 1)) {
      if (!r.some((c) => c !== null && c !== "")) continue;
      const get = (f: Field) => (map[f] >= 0 ? r[map[f]] : null);
      if (map.status >= 0 && get("status") !== null && !OK_STATUS.test(String(get("status")))) { skippedStatus++; continue; }
      const d = toDate(get("created_at")), amount = toAmount(get("amount")), product = String(get("product") ?? "").trim();
      if (!d || amount === null || !product) { bad++; continue; }
      const s = (f: Field) => { const v = get(f); return v === null || v === "" ? null : String(v).trim(); };
      ok.push({ ref_id: s("ref_id"), created_at: d.toISOString(), email: s("email"), name: s("name"), phone: s("phone"), product, amount });
    }
    return { ok, skippedStatus, bad };
  }, [rows, headerIdx, map]);

  async function run(dryRun: boolean) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<Preview & { added?: number; contactsAdded?: number }>("/api/admin/orders", { action: "import", rows: parsed.ok, dryRun });
      if (dryRun) setPreview(r);
      else {
        setMsg(`✓ ${num(r.added)} order baru disimpan, ${num(r.already)} sudah ada sebelumnya, ${num(r.contactsAdded)} nomor WA baru masuk Broadcast.`);
        setPreview(null); setRows([]); setMap(null); onDone();
      }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const dates = parsed.ok.map((o) => o.created_at).sort();
  return (
    <Card title="Unggah ekspor Lynk">
      <ol className="list-decimal space-y-0.5 pl-5 text-sm text-slate-600">
        <li>Di dashboard Lynk, ekspor transaksi (per 45 hari) sebagai .xlsx.</li>
        <li>Pilih file di bawah. Cek kolom dan contoh baris, lalu tekan <b>Cek dulu</b>.</li>
        <li>Kalau total di pratinjau sama dengan di Lynk, tekan <b>Simpan</b>. Mengunggah file yang sama dua kali aman, tidak dihitung dobel.</li>
      </ol>
      <input type="file" accept=".xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} className="mt-3 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#0B2A5B] file:px-4 file:py-2 file:text-white" />
      {msg && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{msg}</p>}

      {map && (
        <div className="mt-4 grid gap-3">
          <div className="text-sm"><b>{fileName}</b> · baris judul ke-
            <input type="number" min={1} max={rows.length} value={headerIdx + 1} onChange={(e) => { const h = Math.max(0, Number(e.target.value) - 1); setHeaderIdx(h); setMap(guessMap(rows[h] ?? [])); setPreview(null); }} className="ml-1 h-7 w-14 rounded border px-1" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map(([f, label]) => (
              <label key={f} className="text-xs text-slate-500">{label}{["created_at", "product", "amount"].includes(f) && <span className="text-red-600"> *</span>}
                <select value={map[f]} onChange={(e) => { setMap({ ...map, [f]: Number(e.target.value) }); setPreview(null); }} className="mt-0.5 h-9 w-full rounded-lg border px-2 text-sm text-[#0B1B33]">
                  <option value={-1}>— tidak ada —</option>
                  {header.map((c, i) => <option key={i} value={i}>{String(c ?? `Kolom ${i + 1}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-1.5">Tanggal (WIB)</th><th>Produk</th><th className="text-right">Nominal</th><th className="pl-2">Email</th><th>WA</th><th>Nama</th></tr></thead>
              <tbody>{parsed.ok.slice(0, 5).map((o, i) => (
                <tr key={i} className="border-t"><td className="p-1.5">{fmt(o.created_at)}</td><td>{o.product}</td><td className="text-right">{rupiah(o.amount)}</td><td className="pl-2">{o.email}</td><td>{o.phone}</td><td>{o.name}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            {num(parsed.ok.length)} baris terbaca{dates.length ? ` (${fmt(dates[0])} – ${fmt(dates[dates.length - 1])})` : ""} · total {rupiah(parsed.ok.reduce((a, o) => a + o.amount, 0))}
            {parsed.skippedStatus ? ` · ${num(parsed.skippedStatus)} dilewati karena status bukan sukses` : ""}{parsed.bad ? ` · ${num(parsed.bad)} baris tanpa tanggal/produk/nominal` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !parsed.ok.length} onClick={() => void run(true)} className={`h-10 ${btnOutline} px-5 text-sm`}>Cek dulu</button>
            {preview && <button disabled={busy || !preview.fresh} onClick={() => void run(false)} className={`h-10 ${btn}`}>Simpan {num(preview.fresh)} order</button>}
          </div>
          {preview && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="font-medium">Akan disimpan: {num(preview.fresh)} order · {rupiah(Object.values(preview.byKind).reduce((a, k) => a + k.amount, 0))}</div>
              <ul className="mt-1 text-xs text-slate-600">
                {Object.entries(preview.byKind).map(([k, v]) => <li key={k}>{KIND[k] ?? k}: {num(v.n)} order · {rupiah(v.amount)}</li>)}
              </ul>
              <div className="mt-1 text-xs text-slate-500">
                Dilewati: {num(preview.already)} sudah ada · {num(preview.sribuklip)} produk Sribuklip · {num(preview.dupInFile)} dobel di file · {num(preview.invalid)} tidak valid
                {preview.afterCutoff ? ` · ${num(preview.afterCutoff)} sesudah ${fmt(preview.cutoff)} (sudah dicatat otomatis)` : ""}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
