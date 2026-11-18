// AI dashboard admin (Claude), hanya saat tombol ditekan:
//   support = baca chat Bantuan 30 hari terakhir → masalah apa saja + to-do (saya / CTO)
//   reply   = saran balasan untuk satu percakapan Bantuan (tidak dikirim otomatis)
//   recap   = rekap harian / mingguan / bulanan dari angka dashboard + saran tindakan
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { admin, authorized, deny, fail } from "../_lib";
import { MODEL, PRODUCT, aiError, claude, costUsd, saveReport } from "../_ai";
import { overview, type Period } from "../_overview";

export const maxDuration = 120;

const TodoSchema = z.object({
  ringkasan: z.string(),
  todos: z.array(z.object({
    title: z.string(),
    detail: z.string(),
    area: z.enum(["aplikasi", "api_key", "pembayaran", "akun", "tempel_link", "render", "lain"]),
    owner: z.enum(["saya", "cto"]),
    priority: z.enum(["tinggi", "sedang", "rendah"]),
    emails: z.array(z.string()),
  })),
});

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
const wib = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const kind = new URL(req.url).searchParams.get("kind");
    let q = admin().from("admin_ai_reports").select("*").order("id", { ascending: false }).limit(20);
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ reports: (data ?? []).map((r) => ({ ...r, cost_usd: costUsd(r.model, r.input_tokens, r.output_tokens) })) });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  let body: { kind?: string; email?: string; period?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Body tidak valid" }, { status: 400 }); }
  try {
    if (body.kind === "support") return NextResponse.json(await supportTodos());
    if (body.kind === "reply" && body.email) return NextResponse.json(await replyDraft(body.email.toLowerCase()));
    if (body.kind === "recap") return NextResponse.json(await recap(body.period === "week" || body.period === "month" ? body.period : "day"));
    return NextResponse.json({ error: "Jenis permintaan tidak dikenal" }, { status: 400 });
  } catch (e) {
    if (e && typeof e === "object" && "status" in e) return NextResponse.json({ error: aiError(e) }, { status: 502 });
    return fail(e);
  }
}

async function supportTodos() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [msgs, open] = await Promise.all([
    admin().from("support_messages").select("email, from_admin, body, video_title, created_at").gte("created_at", since).order("id").limit(600),
    admin().from("admin_todos").select("title").eq("status", "baru").limit(200),
  ]);
  if (msgs.error) throw msgs.error;
  if (!msgs.data?.length) return { ringkasan: "Tidak ada chat Bantuan dalam 30 hari terakhir.", added: 0 };

  const threads = new Map<string, string[]>();
  for (const m of msgs.data) {
    const line = `[${wib(m.created_at)}] ${m.from_admin ? "ADMIN" : "PEMBELI"}${m.video_title ? ` (video: ${clip(m.video_title, 60)})` : ""}: ${clip(m.body, 600)}`;
    threads.set(m.email, [...(threads.get(m.email) ?? []), line]);
  }
  const transcript = [...threads].map(([email, lines]) => `### ${email}\n${lines.join("\n")}`).join("\n\n");
  const existing = (open.data ?? []).map((t) => `- ${t.title}`).join("\n") || "(kosong)";

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(TodoSchema) },
    system: `Kamu membantu pemilik ClipPost (bisnis 1 orang) mengelola chat Bantuan dari aplikasi. Fakta produk:\n${PRODUCT}`,
    messages: [{
      role: "user",
      content: `Berikut chat Bantuan 30 hari terakhir, dikelompokkan per pembeli.\n\n${transcript}\n\nTo-do yang masih terbuka (jangan dibuat ulang):\n${existing}\n\nTugas:\n1. "ringkasan": 3-6 kalimat bahasa Indonesia sederhana: masalah apa yang paling sering, berapa pembeli terdampak, dan mana yang paling mendesak.\n2. "todos": kelompokkan keluhan yang sama jadi SATU to-do (bukan satu per chat). Judul singkat berupa tindakan. "detail": apa masalahnya, dugaan penyebab, dan langkah konkret. owner "cto" kalau perlu perubahan kode/aplikasi/server, "saya" kalau cukup dibalas, diaktifkan manual, atau urusan pembayaran. "emails": pembeli yang terdampak. Lewati percakapan yang sudah selesai dibalas admin dan tidak ada keluhan baru.`,
    }],
  });
  const out = res.parsed_output;
  if (!out) throw new Error("Jawaban AI tidak bisa dibaca, coba lagi");
  if (out.todos.length) {
    const { error } = await admin().from("admin_todos").insert(out.todos.map((t) => ({
      title: clip(t.title, 300), detail: clip(t.detail, 3000), area: t.area, owner: t.owner, priority: t.priority,
      emails: t.emails.slice(0, 50), source: "ai-bantuan",
    })));
    if (error) throw error;
  }
  const report = await saveReport("support", null, out.ringkasan, res.usage);
  return { ringkasan: out.ringkasan, added: out.todos.length, report };
}

async function replyDraft(email: string) {
  const [msgs, user, jobs] = await Promise.all([
    admin().from("support_messages").select("from_admin, body, video_title, created_at").eq("email", email).order("id").limit(60),
    admin().from("users_premium").select("tier, expires_at, v7_paid, trial_video_id, trial_started_at, paste_link_until, last_login, device_changed_at").eq("email", email).maybeSingle(),
    admin().from("link_jobs").select("status, error, created_at").eq("email", email).order("id", { ascending: false }).limit(5),
  ]);
  if (msgs.error) throw msgs.error;
  if (!msgs.data?.length) throw new Error("Percakapan kosong");
  const chat = msgs.data.map((m) => `[${wib(m.created_at)}] ${m.from_admin ? "ADMIN" : "PEMBELI"}: ${clip(m.body, 1000)}`).join("\n");
  const u = user.data;
  const status = u ? `tier ${u.tier}${u.expires_at ? `, aktif s/d ${wib(u.expires_at)}` : ""}; New Update ${u.v7_paid ? "sudah bayar/berhak" : "BELUM bayar"}; uji coba ${u.trial_video_id ? `dipakai ${wib(u.trial_started_at)}` : "belum dipakai"}; Tempel link ${u.paste_link_until ? `s/d ${wib(u.paste_link_until)}` : "tidak aktif"}; login terakhir ${u.last_login ? wib(u.last_login) : "-"}` : "email tidak terdaftar sebagai pembeli";
  const jobLines = (jobs.data ?? []).map((j) => `${wib(j.created_at)} ${j.status}${j.error ? ` (${clip(j.error, 120)})` : ""}`).join("; ") || "-";

  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system: `Kamu admin ClipPost yang membalas chat Bantuan di aplikasi. Bahasa Indonesia santai dan sopan (panggil "kak"), singkat, langkah jelas bernomor kalau perlu. Jangan janji hal di luar fakta produk; kalau perlu dicek manual, bilang admin akan cek. Tulis HANYA isi balasannya.\nFakta produk:\n${PRODUCT}`,
    messages: [{ role: "user", content: `Data pembeli (${email}): ${status}\nTempel link terakhir: ${jobLines}\n\nPercakapan:\n${chat}\n\nTulis balasan untuk pesan pembeli yang terakhir.` }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  await saveReport("reply", email, text, res.usage);
  return { draft: text, cost_usd: costUsd(MODEL, res.usage.input_tokens, res.usage.output_tokens) };
}

const LABEL: Record<Period, string> = { day: "hari ini", week: "7 hari terakhir", month: "30 hari terakhir" };

async function recap(period: Period) {
  const data = await overview(period);
  const todos = await admin().from("admin_todos").select("title, owner, priority").eq("status", "baru").limit(50);
  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 6000,
    output_config: { effort: "medium" },
    system: `Kamu analis bisnis untuk pemilik ClipPost (bisnis 1 orang, modal terbatas). Bahasa Indonesia sederhana, langsung ke inti, pakai angka dari data. Jangan mengarang angka yang tidak ada di data; kalau data belum cukup (mis. pencatatan order baru dimulai), katakan begitu.\nFakta produk:\n${PRODUCT}`,
    messages: [{
      role: "user",
      content: `Rekap ${LABEL[period]} (WIB). Angka periode ini:\n${JSON.stringify(data.current)}\n\nPeriode sebelumnya dengan panjang sama:\n${JSON.stringify(data.previous)}\n\nPer hari (30 hari):\n${JSON.stringify(data.daily)}\n\nTempel link habis ≤7 hari: ${JSON.stringify(data.expiring)}\n\nTo-do terbuka: ${JSON.stringify(todos.data ?? [])}\n\nTulis rekap dengan bagian: "Angka utama" (naik/turun dibanding periode sebelumnya), "Yang perlu diperhatikan", dan "3 tindakan berikutnya" (paling berdampak ke pendapatan dulu). Maksimal 250 kata. Teks biasa, tanpa tabel.`,
    }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  const report = await saveReport("recap", period, text, res.usage);
  return { report: { ...report, cost_usd: costUsd(MODEL, res.usage.input_tokens, res.usage.output_tokens) } };
}
