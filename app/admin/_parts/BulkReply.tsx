"use client";

// Jawab massal: AI mengelompokkan pembeli yang masih menunggu balasan per topik. Admin menulis SATU jawaban per
// topik, lalu sekali klik setiap pembeli menerima gabungan jawaban dari topik yang dia tanyakan. Yang dikirim persis
// teks admin (AI tidak menulis ulang); saran AI hanya dipakai kalau admin menekan "Pakai saran".
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, btn, btnOutline, fmt, num, useApi } from "./ui";

type Topic = { judul: string; ringkasan: string; emails: string[]; saran_jawaban: string };
type Groups = { topics: Topic[]; createdAt: string | null; waiting: number; notGrouped: string[] };
const GREETING = "Halo kak 🙏";

export function BulkReply({ password, onSent, openThread }: { password: string; onSent: () => void; openThread: (email: string) => void }) {
  const api = useApi(password);
  const [g, setG] = useState<Groups | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"group" | "send" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    try { setG(await api<Groups>("/api/admin/support?groups=1")); } catch (e) { setMsg((e as Error).message); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  async function group() {
    setBusy("group"); setMsg(null);
    try { await api("/api/admin/ai", { kind: "groups" }); setAnswers({}); await load(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  // Pesan akhir per pembeli = salam + jawaban semua topik (yang sudah diisi) yang dia tanyakan
  const outgoing = useMemo(() => {
    const per = new Map<string, string[]>();
    for (const t of g?.topics ?? []) {
      const a = (answers[t.judul] ?? "").trim();
      if (!a) continue;
      for (const e of t.emails) per.set(e, [...(per.get(e) ?? []), a]);
    }
    return [...per].map(([email, parts]) => ({ email, body: `${GREETING}\n\n${[...new Set(parts)].join("\n\n")}` }));
  }, [g, answers]);

  async function send() {
    if (!confirm(`Kirim balasan ke ${outgoing.length} pembeli sekarang?`)) return;
    setBusy("send"); setMsg(null);
    try {
      const r = await api<{ sent: number }>("/api/admin/support", { bulk: outgoing });
      setMsg(`✓ Terkirim ke ${r.sent} pembeli. Mereka melihatnya di menu Bantuan aplikasi.`);
      setAnswers({}); setShowPreview(false); await load(); onSent();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(null); }
  }

  const topics = g?.topics ?? [];
  return (
    <Card title="Jawab massal" action={
      <button disabled={busy !== null} onClick={() => void group()} className={`h-9 ${btn}`}>{busy === "group" ? "AI mengelompokkan…" : topics.length ? "Kelompokkan ulang" : "Kelompokkan pertanyaan"}</button>
    }>
      <p className="text-sm text-slate-500">
        {g ? <><b className="text-[#0B1B33]">{num(g.waiting)} pembeli</b> menunggu balasan. </> : ""}
        AI mengelompokkan pertanyaan yang sama. Kamu cukup tulis satu jawaban per topik, lalu sekali klik semua terjawab. Yang terkirim persis tulisanmu, diawali &quot;{GREETING}&quot;.
      </p>
      {g?.createdAt && <p className="mt-1 text-xs text-slate-400">Dikelompokkan {fmt(g.createdAt)}. Pembeli yang sudah dibalas otomatis hilang dari daftar.{g.notGrouped.length ? ` ${g.notGrouped.length} pesan baru masuk setelah itu; tekan "Kelompokkan ulang".` : ""}</p>}
      {msg && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{msg}</p>}

      <div className="mt-4 grid gap-3">
        {topics.map((t) => {
          const a = answers[t.judul] ?? "";
          return (
            <div key={t.judul} className={`rounded-2xl border p-4 ${a.trim() ? "border-emerald-300 bg-emerald-50/40" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{t.judul}</h3>
                <span className="rounded-full bg-[#0B2A5B] px-2 py-0.5 text-xs text-white">{t.emails.length} pembeli</span>
                {a.trim() && <span className="text-xs text-emerald-700">✓ siap dikirim</span>}
              </div>
              <p className="mt-1 text-sm text-slate-600">{t.ringkasan}</p>
              <details className="mt-1 text-xs text-slate-500">
                <summary className="cursor-pointer">Siapa saja</summary>
                <div className="mt-1 flex flex-wrap gap-1">{t.emails.map((e) => <button key={e} onClick={() => openThread(e)} className="rounded-full border px-2 py-0.5 hover:bg-slate-50">{e}</button>)}</div>
              </details>
              <textarea value={a} onChange={(e) => setAnswers({ ...answers, [t.judul]: e.target.value })} rows={4}
                placeholder={t.saran_jawaban ? `Saran AI:\n${t.saran_jawaban}` : "Tulis jawaban untuk topik ini…"}
                className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm placeholder:text-slate-400" />
              {t.saran_jawaban && !a && <button onClick={() => setAnswers({ ...answers, [t.judul]: t.saran_jawaban })} className={`mt-1 ${btnOutline}`}>Pakai saran AI lalu edit</button>}
            </div>
          );
        })}
        {g && topics.length === 0 && <p className="py-4 text-center text-sm text-slate-500">{g.waiting ? "Tekan \"Kelompokkan pertanyaan\"." : "Semua chat sudah dibalas 🎉"}</p>}
      </div>

      {outgoing.length > 0 && (
        <div className="sticky bottom-3 mt-4 rounded-2xl border bg-white p-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm"><b>{outgoing.length}</b> pembeli akan menerima balasan</span>
            <button onClick={() => setShowPreview(!showPreview)} className={btnOutline}>{showPreview ? "Tutup pratinjau" : "Lihat pratinjau"}</button>
            <button disabled={busy !== null} onClick={() => void send()} className={`ml-auto h-10 ${btn}`}>{busy === "send" ? "Mengirim…" : `Kirim ke ${outgoing.length} pembeli`}</button>
          </div>
          {showPreview && (
            <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto">
              {outgoing.map((o) => (
                <div key={o.email} className="rounded-xl bg-slate-50 p-2 text-xs"><div className="font-medium">{o.email}</div><p className="mt-1 whitespace-pre-wrap text-slate-700">{o.body}</p></div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
