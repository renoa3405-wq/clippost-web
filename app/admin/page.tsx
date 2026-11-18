"use client";

// Admin ClipPost: ringkasan bisnis + rekap, pembeli, bantuan (+ AI to-do / saran balasan), to-do, broadcast WA,
// pengaturan AI (ganti model tanpa update APK), dan update aplikasi.
// Password admin disimpan di sessionStorage tab ini saja dan dikirim ke API admin lewat header.
import { useCallback, useEffect, useState } from "react";
import { Card, btnOutline, fmt, useApi } from "./_parts/ui";
import { Overview } from "./_parts/Overview";
import { Broadcast } from "./_parts/Broadcast";
import { Todos } from "./_parts/Todos";

type Buyer = { id: string; email: string; tier: "basic" | "pro"; expires_at: string | null; device_id: string | null; last_login: string | null; paste_link_until: string | null; registered_at: string | null; v7_paid: boolean | null; trial_video_id: string | null };
type Thread = { email: string; lastMessage: string; lastAt: string; lastFromAdmin: boolean; unread: number };
type Message = { id: number; email: string; from_admin: boolean; body: string; created_at: string };
type StageModel = { models: string[]; reasoning: string; maxOutput: number };
type AiConfig = { ai_models: Record<string, StageModel> | null; whisper_models: string[] | null; line_format: string | null; purchase_url: string | null; paste_link_url: string | null; updated_at?: string };
type AppUpdate = { version: string; apk_url: string; changelog: string | null; created_at: string };

const KEY = "clippost-admin-password";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"overview" | "buyers" | "support" | "todos" | "broadcast" | "ai" | "update">("overview");
  useEffect(() => { setPassword(sessionStorage.getItem(KEY) ?? ""); }, []);

  if (!password) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F7F9FC] px-6 text-[#0B1B33]">
        <form onSubmit={(e) => { e.preventDefault(); sessionStorage.setItem(KEY, input); setPassword(input); }} className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Admin ClipPost</h1>
          <p className="mt-1 text-sm text-slate-500">Masukkan password admin.</p>
          <input type="password" value={input} onChange={(e) => setInput(e.target.value)} className="mt-5 h-11 w-full rounded-full border px-4 outline-none focus:border-[#1A73E8]" autoFocus />
          <button className="mt-3 h-11 w-full rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] font-medium text-white">Masuk</button>
        </form>
      </main>
    );
  }

  const tabs = [["overview", "Ringkasan"], ["buyers", "Pembeli"], ["support", "Bantuan"], ["todos", "To-do"], ["broadcast", "Broadcast"], ["ai", "Pengaturan AI"], ["update", "Update App"]] as const;
  return (
    <main className="min-h-screen bg-[#F7F9FC] text-[#0B1B33]">
      <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <h1 className="text-lg font-semibold">Admin ClipPost</h1>
          <nav className="ml-auto flex gap-1 overflow-x-auto">
            {tabs.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === id ? "bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
            ))}
          </nav>
          <button onClick={() => { sessionStorage.removeItem(KEY); setPassword(""); }} className="text-xs text-slate-500 underline">Keluar</button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">
        {tab === "overview" && <Overview password={password} />}
        {tab === "buyers" && <Buyers password={password} />}
        {tab === "support" && <Support password={password} />}
        {tab === "todos" && <Todos password={password} />}
        {tab === "broadcast" && <Broadcast password={password} />}
        {tab === "ai" && <AiSettings password={password} />}
        {tab === "update" && <Updates password={password} />}
      </div>
    </main>
  );
}


function Buyers({ password }: { password: string }) {
  const api = useApi(password);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Buyer[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newTier, setNewTier] = useState<"basic" | "pro">("basic");
  const load = useCallback(async () => {
    try { setRows((await api<{ buyers: Buyer[] }>(`/api/admin/buyers?q=${encodeURIComponent(q)}`)).buyers); setMsg(null); } catch (e) { setMsg((e as Error).message); }
  }, [api, q]);
  useEffect(() => { void load(); }, [load]);
  async function act(action: string, email: string, extra: Record<string, unknown> = {}) {
    if (action === "deactivate" && !confirm(`Nonaktifkan ${email}?`)) return;
    try { await api("/api/admin/buyers", { action, email, ...extra }); setMsg(`✓ ${email} diperbarui`); await load(); } catch (e) { setMsg((e as Error).message); }
  }
  const status = (b: Buyer) => (b.tier === "pro" ? "Pro selamanya" : b.expires_at && new Date(b.expires_at) < new Date() ? "Basic · habis" : `Basic s/d ${fmt(b.expires_at)}`)
    + (b.v7_paid ? " · New Update ✓" : b.trial_video_id ? " · uji coba dipakai, belum bayar" : b.tier === "pro" ? " · belum New Update" : "");
  return (
    <div className="grid gap-4">
      <Card title="Aktivasi manual">
        <p className="text-sm text-slate-500">Untuk pembeli yang sudah bayar tapi belum bisa login (mis. webhook Lynk terlewat).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@gmail.com" className="h-10 min-w-0 flex-1 rounded-full border px-4" />
          <select value={newTier} onChange={(e) => setNewTier(e.target.value as "basic" | "pro")} className="h-10 rounded-full border px-3"><option value="basic">Basic (2 bulan)</option><option value="pro">Pro (selamanya)</option></select>
          <button onClick={() => void act("activate", newEmail, { tier: newTier }).then(() => setNewEmail(""))} className="h-10 rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] px-5 text-sm font-medium text-white">Aktifkan</button>
        </div>
      </Card>
      <Card>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari email…" className="h-10 flex-1 rounded-full border px-4" />
          <button onClick={() => void load()} className="h-10 rounded-full border px-4 text-sm">Cari</button>
        </div>
        {msg && <p className="mt-3 text-sm">{msg}</p>}
        <div className="mt-4 divide-y">
          {rows.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{b.email}</div>
                <div className="text-xs text-slate-500">{status(b)} · HP {b.device_id ? "terkunci" : "belum login"} · daftar {fmt(b.registered_at)} · login terakhir {fmt(b.last_login)}{b.paste_link_until ? ` · Tempel link s/d ${fmt(b.paste_link_until)}` : ""}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => void act("extend", b.email)} className="rounded-full border px-3 py-1 text-xs">+2 bulan</button>
                {b.tier !== "pro" && <button onClick={() => void act("pro", b.email)} className="rounded-full border px-3 py-1 text-xs">Jadikan Pro</button>}
                <button onClick={() => void act("reset_device", b.email)} className="rounded-full border px-3 py-1 text-xs">Reset HP</button>
                <button onClick={() => void act("paste_link", b.email)} className="rounded-full border px-3 py-1 text-xs">+1 bln Tempel link</button>
                <button onClick={() => void act("deactivate", b.email)} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600">Nonaktifkan</button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Tidak ada data</p>}
        </div>
      </Card>
    </div>
  );
}

function Support({ password }: { password: string }) {
  const api = useApi(password);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [busy, setBusy] = useState<"todo" | "draft" | null>(null);
  async function analyze() {
    setBusy("todo"); setErr(null);
    try { const r = await api<{ ringkasan: string; added: number }>("/api/admin/ai", { kind: "support" }); setAi(`${r.ringkasan}

→ ${r.added} to-do baru dibuat (lihat tab To-do).`); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  async function draft() {
    if (!open) return;
    setBusy("draft"); setErr(null);
    try { setReply((await api<{ draft: string }>("/api/admin/ai", { kind: "reply", email: open })).draft); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const loadThreads = useCallback(async () => {
    try { setThreads((await api<{ threads: Thread[] }>("/api/admin/support")).threads); } catch (e) { setErr((e as Error).message); }
  }, [api]);
  useEffect(() => { void loadThreads(); const t = setInterval(() => void loadThreads(), 20000); return () => clearInterval(t); }, [loadThreads]);
  async function openThread(email: string) {
    setOpen(email);
    try { setMessages((await api<{ messages: Message[] }>(`/api/admin/support?email=${encodeURIComponent(email)}`)).messages); void loadThreads(); } catch (e) { setErr((e as Error).message); }
  }
  async function send() {
    if (!open || !reply.trim()) return;
    try { setMessages((await api<{ messages: Message[] }>("/api/admin/support", { email: open, body: reply })).messages); setReply(""); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div className="grid gap-4">
    <Card title="Analisa AI" action={<button disabled={busy !== null} onClick={() => void analyze()} className="h-9 rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] px-4 text-sm font-medium text-white disabled:opacity-50">{busy === "todo" ? "Membaca chat…" : "Analisa chat → to-do"}</button>}>
      {ai ? <p className="whitespace-pre-wrap text-sm">{ai}</p> : <p className="text-sm text-slate-500">AI membaca semua chat 30 hari terakhir, mengelompokkan keluhan, lalu membuat to-do: untuk kamu (balas / aktivasi / pembayaran) atau untuk CTO (perbaikan kode). Sekitar Rp1.000–5.000 sekali analisa.</p>}
    </Card>
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <Card title="Percakapan">
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <div className="divide-y">
          {threads.map((t) => (
            <button key={t.email} onClick={() => void openThread(t.email)} className={`block w-full py-2 text-left text-sm ${open === t.email ? "font-semibold" : ""}`}>
              <div className="flex items-center gap-2"><span className="truncate">{t.email}</span>{t.unread > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{t.unread}</span>}</div>
              <div className="truncate text-xs text-slate-500">{t.lastFromAdmin ? "Kamu: " : ""}{t.lastMessage}</div>
            </button>
          ))}
          {threads.length === 0 && <p className="py-4 text-sm text-slate-500">Belum ada pesan</p>}
        </div>
      </Card>
      <Card title={open ?? "Pilih percakapan"}>
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.from_admin ? "ml-auto bg-[#1A73E8] text-white" : "bg-slate-100"}`}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-1 text-[10px] ${m.from_admin ? "text-white/70" : "text-slate-500"}`}>{fmt(m.created_at)}</p>
            </div>
          ))}
        </div>
        {open && (
          <div className="mt-3 flex gap-2">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="Tulis balasan, atau tekan Saran AI lalu edit…" />
            <div className="flex flex-col gap-1">
              <button onClick={() => void send()} className="flex-1 rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] px-5 text-sm font-medium text-white">Kirim</button>
              <button disabled={busy !== null} onClick={() => void draft()} className={btnOutline}>{busy === "draft" ? "Menulis…" : "Saran AI"}</button>
            </div>
          </div>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </Card>
    </div>
    </div>
  );
}

const STAGES: [string, string][] = [["stage1", "Cari momen (tahap 1)"], ["stage2", "Pilih klip + hook (tahap 2)"], ["longHook", "Hook panjang (Dua warna)"], ["broll", "Rencana B-roll"]];

function AiSettings({ password }: { password: string }) {
  const api = useApi(password);
  const [ai, setAi] = useState<AiConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await api<{ ai: AiConfig }>("/api/admin/settings");
      setAi(d.ai);
      const m = d.ai?.ai_models ?? {};
      setDraft({
        ...Object.fromEntries(STAGES.map(([k]) => [k, (m[k]?.models ?? []).join("\n")])),
        whisper: (d.ai?.whisper_models ?? ["whisper-large-v3-turbo", "whisper-large-v3"]).join("\n"),
        purchase: d.ai?.purchase_url ?? "", paste: d.ai?.paste_link_url ?? "", format: d.ai?.line_format ?? "compact",
      });
    } catch (e) { setMsg((e as Error).message); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  async function save() {
    const base = ai?.ai_models ?? {};
    const ai_models = Object.fromEntries(STAGES.map(([k]) => [k, { ...(base[k] ?? { reasoning: k === "stage1" ? "medium" : "low", maxOutput: 3000 }), models: lines(draft[k] ?? "") }]));
    try {
      await api("/api/admin/settings", { kind: "ai", values: { ai_models, whisper_models: lines(draft.whisper ?? ""), purchase_url: draft.purchase || null, paste_link_url: draft.paste || null, line_format: draft.format } });
      setMsg("✓ Tersimpan. Semua HP memakai pengaturan baru dalam ±10 menit.");
      await load();
    } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <Card title="Model AI (Groq, API key milik pembeli)">
      <p className="text-sm text-slate-500">Satu model per baris. Baris pertama = model utama, berikutnya cadangan (dipakai otomatis kalau kuota harian model utama habis atau model dimatikan Groq). Kuota gratis Groq dihitung per model.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {STAGES.map(([k, label]) => (
          <label key={k} className="text-sm font-medium">{label}
            <textarea rows={3} value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs" />
          </label>
        ))}
        <label className="text-sm font-medium">Model transkrip (Whisper)
          <textarea rows={3} value={draft.whisper ?? ""} onChange={(e) => setDraft({ ...draft, whisper: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs" />
        </label>
        <label className="text-sm font-medium">Format transkrip ke AI
          <select value={draft.format ?? "compact"} onChange={(e) => setDraft({ ...draft, format: e.target.value })} className="mt-1 h-10 w-full rounded-xl border px-3">
            <option value="compact">Hemat token (disarankan)</option><option value="full">Sama persis Sribuklip</option>
          </select>
        </label>
        <label className="text-sm font-medium">Link beli / perpanjang (Lynk)
          <input value={draft.purchase ?? ""} onChange={(e) => setDraft({ ...draft, purchase: e.target.value })} className="mt-1 h-10 w-full rounded-xl border px-3 text-xs" />
        </label>
        <label className="text-sm font-medium">Link langganan Tempel link
          <input value={draft.paste ?? ""} onChange={(e) => setDraft({ ...draft, paste: e.target.value })} className="mt-1 h-10 w-full rounded-xl border px-3 text-xs" />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={() => void save()} className="h-10 rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] px-6 text-sm font-medium text-white">Simpan</button>
        {msg && <span className="text-sm">{msg}</span>}
      </div>
      {ai?.updated_at && <p className="mt-2 text-xs text-slate-500">Terakhir diubah {fmt(ai.updated_at)}</p>}
    </Card>
  );
}

function Updates({ password }: { password: string }) {
  const api = useApi(password);
  const [rows, setRows] = useState<AppUpdate[]>([]);
  const [v, setV] = useState({ version: "", apk_url: "", changelog: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRows((await api<{ updates: AppUpdate[] }>("/api/admin/settings")).updates ?? []); } catch (e) { setMsg((e as Error).message); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  async function publish() {
    if (!confirm(`Wajibkan semua pengguna update ke versi ${v.version}?`)) return;
    try { await api("/api/admin/settings", { kind: "update", values: v }); setMsg("✓ Update dipublikasikan"); setV({ version: "", apk_url: "", changelog: "" }); await load(); } catch (e) { setMsg((e as Error).message); }
  }
  return (
    <Card title="Update aplikasi (wajib)">
      <p className="text-sm text-slate-500">Pengguna dengan versi APK berbeda akan melihat layar "Update Wajib" dengan tombol download ke link ini.</p>
      <div className="mt-4 grid gap-2">
        <input value={v.version} onChange={(e) => setV({ ...v, version: e.target.value })} placeholder="Versi, mis. 7.0.0 (sama dengan versi di APK)" className="h-10 rounded-full border px-4 text-sm" />
        <input value={v.apk_url} onChange={(e) => setV({ ...v, apk_url: e.target.value })} placeholder="Link download APK" className="h-10 rounded-full border px-4 text-sm" />
        <textarea value={v.changelog} onChange={(e) => setV({ ...v, changelog: e.target.value })} placeholder="Apa yang baru (opsional)" rows={3} className="rounded-2xl border px-4 py-2 text-sm" />
        <button onClick={() => void publish()} className="h-10 rounded-full bg-gradient-to-r from-[#0B2A5B] to-[#1A73E8] text-sm font-medium text-white">Publikasikan update</button>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
      <div className="mt-5 divide-y text-sm">
        {rows.map((r) => <div key={r.created_at} className="py-2"><b>{r.version}</b> · {fmt(r.created_at)}<div className="truncate text-xs text-slate-500">{r.apk_url}</div></div>)}
      </div>
    </Card>
  );
}
