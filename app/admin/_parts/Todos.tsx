"use client";

// To-do: dari AI Bantuan, dari webhook (pembayaran janggal), atau ditulis sendiri. Kolom "CTO" = urusan kode/aplikasi
// yang dikerjakan Claude: buka sesi Claude Code lalu bilang "kerjakan to-do CTO di dashboard".
import { useCallback, useEffect, useState } from "react";
import { Card, Segmented, btn, btnOutline, fmt, useApi } from "./ui";

type Todo = { id: number; title: string; detail: string; area: string; owner: "saya" | "cto"; priority: "tinggi" | "sedang" | "rendah"; status: "baru" | "selesai"; emails: string[]; source: string; created_at: string; done_at: string | null };
const PRIO = { tinggi: 0, sedang: 1, rendah: 2 } as const;
const SOURCE: Record<string, string> = { "ai-bantuan": "AI Bantuan", webhook: "Pembayaran", manual: "Manual" };

export function Todos({ password }: { password: string }) {
  const api = useApi(password);
  const [status, setStatus] = useState<"baru" | "selesai">("baru");
  const [rows, setRows] = useState<Todo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", detail: "", owner: "saya", priority: "sedang" });
  const load = useCallback(async () => {
    try { setRows((await api<{ todos: Todo[] }>(`/api/admin/todos?status=${status}`)).todos); setErr(null); } catch (e) { setErr((e as Error).message); }
  }, [api, status]);
  useEffect(() => { void load(); }, [load]);
  async function act(body: Record<string, unknown>) {
    try { await api("/api/admin/todos", body); await load(); } catch (e) { setErr((e as Error).message); }
  }
  const sorted = [...rows].sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || b.created_at.localeCompare(a.created_at));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={status} onChange={setStatus} options={[["baru", "Belum selesai"], ["selesai", "Selesai"]] as const} />
        <span className="text-xs text-slate-500">To-do dari AI dibuat di tab Bantuan (tombol &quot;Analisa chat → to-do&quot;).</span>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(["saya", "cto"] as const).map((owner) => (
          <Card key={owner} title={owner === "saya" ? "Untuk saya" : "Untuk CTO (Claude)"}>
            {owner === "cto" && status === "baru" && <p className="mb-2 text-xs text-slate-500">Buka sesi Claude Code, lalu ketik: &quot;kerjakan to-do CTO di dashboard&quot;.</p>}
            <div className="divide-y">
              {sorted.filter((t) => t.owner === owner).map((t) => <Item key={t.id} t={t} act={act} />)}
              {!sorted.some((t) => t.owner === owner) && <p className="py-4 text-sm text-slate-500">Kosong.</p>}
            </div>
          </Card>
        ))}
      </div>
      <Card title="Tambah to-do">
        <div className="grid gap-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Apa yang harus dikerjakan" className="h-10 rounded-full border px-4 text-sm" />
          <textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Detail (opsional)" rows={2} className="rounded-xl border px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className="h-10 rounded-full border px-3 text-sm"><option value="saya">Untuk saya</option><option value="cto">Untuk CTO (kode)</option></select>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="h-10 rounded-full border px-3 text-sm"><option value="tinggi">Prioritas tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option></select>
            <button disabled={!form.title.trim()} onClick={() => void act({ action: "add", ...form }).then(() => setForm({ ...form, title: "", detail: "" }))} className={`h-10 ${btn}`}>Tambah</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Item({ t, act }: { t: Todo; act: (b: Record<string, unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3 text-sm">
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={t.status === "selesai"} onChange={() => void act({ action: t.status === "selesai" ? "reopen" : "done", id: t.id })} className="mt-1 size-4" aria-label="Selesai" />
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <div className={`font-medium ${t.status === "selesai" ? "text-slate-400 line-through" : ""}`}>{t.title}</div>
          <div className="text-xs text-slate-500">
            {t.priority === "tinggi" ? "⚠ Tinggi" : t.priority === "sedang" ? "Sedang" : "Rendah"} · {t.area} · {SOURCE[t.source] ?? t.source} · {fmt(t.created_at)}{t.emails.length ? ` · ${t.emails.length} pembeli` : ""}
          </div>
        </button>
      </div>
      {open && (
        <div className="ml-6 mt-2 grid gap-2">
          {t.detail && <p className="whitespace-pre-wrap text-slate-700">{t.detail}</p>}
          {t.emails.length > 0 && <p className="break-all text-xs text-slate-500">{t.emails.join(", ")}</p>}
          <div className="flex flex-wrap gap-1">
            <button onClick={() => void act({ action: "owner", id: t.id, owner: t.owner === "cto" ? "saya" : "cto" })} className={btnOutline}>Pindah ke {t.owner === "cto" ? "saya" : "CTO"}</button>
            <button onClick={() => { if (confirm("Hapus to-do ini?")) void act({ action: "delete", id: t.id }); }} className={`${btnOutline} text-red-600`}>Hapus</button>
          </div>
        </div>
      )}
    </div>
  );
}
