"use client";

// Broadcast WA bertahap. Alur: impor nomor → "Ambil batch" (mis. 500 nomor yang belum pernah dikirimi dan belum bayar
// New Update) → unduh/salin nomornya ke aplikasi broadcast → "Tandai terkirim". Nomor yang sudah dikirimi tidak
// pernah masuk batch lagi, jadi tidak ada yang dikirimi dua kali.
import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, btn, btnOutline, fmt, num, useApi } from "./ui";

type Status = "belum" | "antri" | "terkirim" | "gagal" | "jangan";
type Batch = { id: number; name: string; size: number; created_at: string; sent_at: string | null; queued: number; sent: number; paid: number };
type Summary = { status: Partial<Record<Status, number>>; total: number; paid_before: number; batches: Batch[] };
type Contact = { phone: string; email: string | null; name: string | null; status: Status; batch_id: number | null; sent_at: string | null; paid: boolean; last_login: string | null; tier: string | null };

const FILTERS = [["", "Semua"], ["belum", "Belum dikirimi"], ["antri", "Di batch"], ["terkirim", "Sudah dikirimi"], ["gagal", "Gagal"], ["jangan", "Jangan dikirimi"]] as const;
const STATUS_LABEL: Record<Status, string> = { belum: "Belum", antri: "Di batch", terkirim: "Terkirim", gagal: "Gagal", jangan: "Jangan" };
const TEMPLATE_KEY = "clippost-admin-bc-template";
const DEFAULT_TEMPLATE = "Halo kak {nama}, ClipPost sekarang ada New Update: hasil klip lebih bagus, hook & subtitle baru, dan bisa Tempel link YouTube. Kakak bisa coba 1 video gratis dulu. Download versi terbaru di sribuklip.com/dl ya kak 🙏";
const PAGE = 100;

export function Broadcast({ password }: { password: string }) {
  const api = useApi(password);
  const [sum, setSum] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [size, setSize] = useState(500);
  const [batchName, setBatchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [reloadList, setReloadList] = useState(0);
  const [filterBatch, setFilterBatch] = useState<number | null>(null);

  useEffect(() => { try { const t = localStorage.getItem(TEMPLATE_KEY); if (t) setTemplate(t); } catch {} }, []);
  const saveTemplate = (t: string) => { setTemplate(t); try { localStorage.setItem(TEMPLATE_KEY, t); } catch {} };

  const loadSum = useCallback(async () => {
    try { setSum(await api<Summary>("/api/admin/broadcast?view=summary")); } catch (e) { setMsg((e as Error).message); }
  }, [api]);
  useEffect(() => { void loadSum(); }, [loadSum]);
  const refresh = () => { void loadSum(); setReloadList((n) => n + 1); };

  async function act(body: Record<string, unknown>, done: string, ask?: string) {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    try { const r = await api<{ batch?: number }>("/api/admin/broadcast", body); setMsg(`✓ ${done}${r.batch ? ` (batch #${r.batch})` : ""}`); refresh(); return r; }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  async function batchRows(id: number) {
    return (await api<{ rows: Contact[] }>(`/api/admin/broadcast?batch=${id}&limit=2000`)).rows;
  }
  async function download(b: Batch) {
    const rows = await batchRows(b.id);
    const csv = ["phone,name,email", ...rows.map((r) => [r.phone, r.name ?? "", r.email ?? ""].map((v) => `"${v.replace(/"/g, '""')}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `broadcast-${b.id}-${b.name.replace(/\W+/g, "_")}.csv`;
    a.click();
  }
  async function copyNumbers(b: Batch) {
    const rows = await batchRows(b.id);
    await navigator.clipboard.writeText(rows.map((r) => r.phone).join("\n"));
    setMsg(`✓ ${rows.length} nomor batch #${b.id} disalin`);
  }

  const s = sum?.status ?? {};
  return (
    <div className="grid gap-4">
      {msg && <p className="rounded-xl bg-white p-3 text-sm shadow-sm">{msg}{/admin_broadcast|function|relation/.test(msg) ? " — jalankan dulu clippost_v9_dashboard.sql di Supabase." : ""}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {([["Total nomor", sum?.total], ["Belum dikirimi", s.belum], ["Di batch (belum ditandai)", s.antri], ["Sudah dikirimi", s.terkirim], ["Gagal / jangan", (s.gagal ?? 0) + (s.jangan ?? 0)]] as const).map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{num(v)}</div></div>
        ))}
      </div>
      {!!sum?.paid_before && <p className="text-xs text-slate-500">{num(sum.paid_before)} nomor berstatus &quot;belum&quot; sudah membayar New Update sendiri, jadi otomatis dilewati saat ambil batch.</p>}

      <Card title="Ambil batch berikutnya">
        <p className="text-sm text-slate-500">Mengambil nomor yang belum pernah dikirimi dan belum bayar New Update, mulai dari yang paling baru membuka aplikasi.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input type="number" min={1} max={2000} value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-10 w-28 rounded-full border px-4" />
          <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder={`Nama batch, mis. Batch ${(sum?.batches.length ?? 0) + 1}`} className="h-10 min-w-0 flex-1 rounded-full border px-4" />
          <button disabled={busy} onClick={() => void act({ action: "take", size, name: batchName || `Batch ${(sum?.batches.length ?? 0) + 1}` }, `${size} nomor diambil`).then(() => setBatchName(""))} className={`h-10 ${btn}`}>Ambil</button>
        </div>
      </Card>

      <Card title="Batch">
        {!sum?.batches.length ? <p className="text-sm text-slate-500">Belum ada batch.</p> : (
          <div className="divide-y text-sm">
            {sum.batches.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">#{b.id} {b.name}</div>
                  <div className="text-xs text-slate-500">
                    {num(b.size)} nomor · dibuat {fmt(b.created_at)} · {b.sent_at ? `terkirim ${fmt(b.sent_at)}` : `${num(b.queued)} belum ditandai terkirim`} · <b className="text-[#0B1B33]">{num(b.paid)} bayar New Update{b.sent ? ` (${Math.round((b.paid / b.sent) * 100)}%)` : ""}</b>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => { setFilterBatch(b.id); setReloadList((n) => n + 1); }} className={btnOutline}>Lihat</button>
                  <button onClick={() => void download(b)} className={btnOutline}>Unduh CSV</button>
                  <button onClick={() => void copyNumbers(b)} className={btnOutline}>Salin nomor</button>
                  {b.queued > 0 && <button disabled={busy} onClick={() => void act({ action: "mark_sent", batch: b.id }, `Batch #${b.id} ditandai terkirim`, `Tandai ${b.queued} nomor di batch #${b.id} sudah dikirimi?`)} className={btnOutline}>Tandai terkirim</button>}
                  {b.queued > 0 && <button disabled={busy} onClick={() => void act({ action: "cancel", batch: b.id }, `Batch #${b.id} dibatalkan`, `Kembalikan ${b.queued} nomor yang belum dikirimi ke daftar "belum"?`)} className={`${btnOutline} text-red-600`}>Batalkan</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Template pesan">
        <p className="text-sm text-slate-500">Dipakai untuk tombol WA per nomor di bawah. {"{nama}"} diganti nama pembeli. Tersimpan di browser ini.</p>
        <textarea value={template} onChange={(e) => saveTemplate(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border px-3 py-2 text-sm" />
      </Card>

      <ContactList password={password} template={template} reload={reloadList} batch={filterBatch} clearBatch={() => setFilterBatch(null)} onChanged={() => void loadSum()} />
      <Import password={password} onDone={refresh} />
    </div>
  );
}

function ContactList({ password, template, reload, batch, clearBatch, onChanged }: { password: string; template: string; reload: number; batch: number | null; clearBatch: () => void; onChanged: () => void }) {
  const api = useApi(password);
  const [status, setStatus] = useState<(typeof FILTERS)[number][0]>("belum");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ count: number; rows: Contact[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const p = new URLSearchParams({ status: batch ? "" : status, q, limit: String(PAGE), offset: String(page * PAGE) });
    if (batch) p.set("batch", String(batch));
    try { setData(await api(`/api/admin/broadcast?${p}`)); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, [api, status, q, page, batch]);
  useEffect(() => { void load(); }, [load, reload]);
  async function setRow(phone: string, s: Status) {
    try { await api("/api/admin/broadcast", { action: "set_status", phone, status: s }); void load(); onChanged(); } catch (e) { setErr((e as Error).message); }
  }
  const text = (c: Contact) => template.replace(/\{nama\}/g, c.name?.split(" ")[0] ?? "").replace(/\s+,/g, ",").replace(/kak\s+,/g, "kak,");
  const pages = data ? Math.ceil(data.count / PAGE) : 0;
  return (
    <Card title="Daftar nomor" action={batch ? <button onClick={clearBatch} className={btnOutline}>Batch #{batch} ✕</button> : undefined}>
      {!batch && <div className="overflow-x-auto"><Segmented value={status} onChange={(v) => { setStatus(v); setPage(0); }} options={FILTERS} /></div>}
      <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Cari nomor, email, atau nama…" className="mt-3 h-10 w-full rounded-full border px-4 text-sm" />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-3 text-xs text-slate-500">{data ? `${num(data.count)} nomor` : "…"}</div>
      <div className="mt-1 divide-y text-sm">
        {data?.rows.map((c) => (
          <div key={c.phone} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate"><span className="font-medium tabular-nums">{c.phone}</span> {c.name && <span className="text-slate-500">· {c.name}</span>}</div>
              <div className="truncate text-xs text-slate-500">
                {c.email ?? "email tidak diketahui"} · {STATUS_LABEL[c.status]}{c.sent_at ? ` ${fmt(c.sent_at)}` : ""}{c.batch_id ? ` · batch #${c.batch_id}` : ""}
                {c.paid ? <span className="ml-1 rounded-full bg-emerald-50 px-2 text-emerald-700">✓ sudah bayar</span> : c.tier ? "" : <span className="ml-1 text-amber-700">· email tidak ada di ClipPost</span>}
              </div>
            </div>
            <a href={`https://wa.me/${c.phone}?text=${encodeURIComponent(text(c))}`} target="_blank" rel="noreferrer" onClick={() => { if (c.status === "belum" || c.status === "antri") void setRow(c.phone, "terkirim"); }} className={btnOutline}>Kirim WA</a>
            <select value={c.status} onChange={(e) => void setRow(c.phone, e.target.value as Status)} className="h-7 rounded-full border px-2 text-xs">
              {(Object.keys(STATUS_LABEL) as Status[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </div>
        ))}
        {data && data.rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Tidak ada nomor.</p>}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className={btnOutline}>‹</button>
          <span className="text-xs">Halaman {page + 1} / {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className={btnOutline}>›</button>
        </div>
      )}
    </Card>
  );
}

function Import({ password, onDone }: { password: string; onDone: () => void }) {
  const api = useApi(password);
  const [text, setText] = useState("");
  const [source, setSource] = useState("lynk");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api<{ added: number; existing: number; invalid: number }>("/api/admin/broadcast", { action: "import", text, source });
      setMsg(`✓ ${num(r.added)} nomor baru, ${num(r.existing)} sudah ada (tidak diubah), ${num(r.invalid)} baris tanpa nomor valid`);
      setText(""); onDone();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Card title="Tambah nomor">
      <p className="text-sm text-slate-500">Satu baris satu orang: nomor, email, nama (urutan bebas, dipisah koma atau tab, bisa langsung tempel dari Excel). Nomor 08… otomatis jadi 628…. Nomor yang sudah ada tidak diubah statusnya.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"081234567890, budi@gmail.com, Budi\n6285711112222\tani@gmail.com\tAni"} className="mt-2 w-full rounded-xl border px-3 py-2 font-mono text-xs" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="sumber" className="h-10 w-32 rounded-full border px-4 text-sm" />
        <button disabled={busy || !text.trim()} onClick={() => void run()} className={`h-10 ${btn}`}>{busy ? "Mengimpor…" : "Impor"}</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
    </Card>
  );
}
