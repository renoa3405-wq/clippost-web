// AI dashboard admin (Claude), hanya saat tombol ditekan:
//   support = baca chat Bantuan 30 hari terakhir → masalah apa saja + to-do (saya / CTO)
//   groups  = kelompokkan pembeli yang MASIH menunggu balasan per topik, untuk dibalas massal (admin yang menulis jawabannya)
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

const GroupSchema = z.object({
  topics: z.array(z.object({
    judul: z.string(),
    ringkasan: z.string(),
    emails: z.array(z.string()),
    saran_jawaban: z.string(),
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
    if (body.kind === "groups") return NextResponse.json(await groupWaiting());
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

async function groupWaiting() {
  const { data, error } = await admin().from("support_messages").select("email, from_admin, body, video_title, created_at").order("id").limit(5000);
  if (error) throw error;
  type Msg = NonNullable<typeof data>[number];
  const byEmail = new Map<string, Msg[]>();
  for (const m of data ?? []) byEmail.set(m.email, [...(byEmail.get(m.email) ?? []), m]);
  // Menunggu = pesan terakhir dari pembeli. Yang ditanyakan = pesan pembeli setelah balasan admin terakhir.
  const waiting = [...byEmail].filter(([, ms]) => !ms[ms.length - 1].from_admin);
  if (!waiting.length) {
    await saveReport("groups", null, JSON.stringify({ topics: [] }), { input_tokens: 0, output_tokens: 0 });
    return { topics: [], waiting: 0 };
  }
  const transcript = waiting.map(([email, ms]) => {
    const lastAdmin = ms.map((m) => m.from_admin).lastIndexOf(true);
    const context = lastAdmin < 0 ? [] : ms.slice(Math.max(0, lastAdmin - 3), lastAdmin + 1).map((m) => `  (sebelumnya) ${m.from_admin ? "ADMIN" : "PEMBELI"}: ${clip(m.body, 300)}`);
    const open = ms.slice(lastAdmin + 1).map((m) => `  PEMBELI${m.video_title ? ` (video: ${clip(m.video_title, 60)})` : ""}: ${clip(m.body, 800)}`);
    return `### ${email}\n${[...context, ...open].join("\n")}`;
  }).join("\n\n");

  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(GroupSchema) },
    system: `Kamu membantu pemilik ClipPost membalas chat Bantuan secara massal. Fakta produk:\n${PRODUCT}`,
    messages: [{
      role: "user",
      content: `Berikut pembeli yang MASIH menunggu balasan. Baris "PEMBELI" tanpa "(sebelumnya)" adalah pertanyaan yang belum dijawab.\n\n${transcript}\n\nKelompokkan pertanyaan yang belum dijawab per topik (mis. "API key Pexels tidak bisa dibuat", "Cara aktifkan Tempel link"). Aturan:\n- Satu pembeli boleh masuk lebih dari satu topik kalau bertanya beberapa hal.\n- SETIAP email di atas wajib masuk minimal satu topik; yang tidak jelas masuk topik "Lainnya (baca sendiri)".\n- "emails" persis seperti tertulis di atas.\n- "judul" singkat (maks 6 kata). "ringkasan": 1 kalimat, apa yang mereka tanyakan.\n- "saran_jawaban": draf jawaban untuk SEMUA pembeli di topik itu, bahasa santai sopan, langkah bernomor kalau perlu, TANPA salam pembuka (salam ditambahkan otomatis). Hanya pakai fakta produk di atas; kalau tidak tahu jawabannya, kosongkan.`,
    }],
  });
  const out = res.parsed_output;
  if (!out) throw new Error("Jawaban AI tidak bisa dibaca, coba lagi");
  // Pastikan tidak ada email salah tulis dan tidak ada pembeli yang terlewat
  const valid = new Set(waiting.map(([e]) => e));
  const topics = out.topics.map((t) => ({ ...t, emails: [...new Set(t.emails.map((e) => e.trim().toLowerCase()).filter((e) => valid.has(e)))] })).filter((t) => t.emails.length);
  const covered = new Set(topics.flatMap((t) => t.emails));
  const missed = [...valid].filter((e) => !covered.has(e));
  if (missed.length) topics.push({ judul: "Lainnya (baca sendiri)", ringkasan: "AI tidak yakin topiknya; buka percakapannya dulu.", emails: missed, saran_jawaban: "" });
  await saveReport("groups", null, JSON.stringify({ topics }), res.usage);
  return { topics, waiting: valid.size, cost_usd: costUsd(MODEL, res.usage.input_tokens, res.usage.output_tokens) };
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

type Stats = Record<string, unknown> & { orders_since: string | null; activity_since: string };

// Angka dengan nama yang jelas + batas data yang belum tercatat, supaya AI tidak salah baca atau salah bandingkan
function describe(s: Stats, from: Date) {
  const rp = (n: unknown) => `Rp${Number(n ?? 0).toLocaleString("id-ID")}`;
  const ordersOk = !!s.orders_since && new Date(s.orders_since) <= from;
  const activityOk = new Date(s.activity_since + "T00:00:00+07:00") <= from;
  return [
    `Total pembeli terdaftar: ${s.total_users} (Pro ${s.pro}, Basic aktif ${s.basic_active})`,
    `Pembeli baru terdaftar: ${s.new_users}`,
    `Pengguna yang membuka aplikasi: ${activityOk ? s.active_users : "BELUM TERCATAT untuk seluruh periode ini"}`,
    `Pro lama yang belum bayar New Update (saat ini): ${s.old_pro_unpaid}`,
    `Uji coba dimulai: ${s.trials_new}; total uji coba sepanjang waktu ${s.trials_total}, ${s.trials_paid} di antaranya sudah bayar New Update`,
    ordersOk ? `Order: ${s.orders}, pendapatan ${rp(s.revenue)}, New Update terjual ${s.update_sold}, perpanjangan ${s.renewals}, rincian ${JSON.stringify(s.revenue_by_kind)}`
      : `Order/pendapatan: TIDAK LENGKAP untuk periode ini (pencatatan order mulai ${s.orders_since ?? "belum ada order tercatat"}); yang tercatat: ${s.orders} order, ${rp(s.revenue)}`,
    `Tempel link aktif (saat ini): ${s.paste_active}, habis ≤7 hari: ${s.paste_expiring_7d}; diproses periode ini ${s.link_jobs} (gagal ${s.link_jobs_failed})`,
    `Chat Bantuan masuk: ${s.support_in}; pembeli menunggu balasan (saat ini): ${s.support_waiting}; pesan belum dibaca: ${s.support_unread}`,
    `Broadcast terkirim: ${s.bc_sent}`,
  ].join("\n");
}

async function recap(period: Period) {
  const data = await overview(period);
  const todos = await admin().from("admin_todos").select("title, owner, priority").eq("status", "baru").limit(50);
  const res = await claude().messages.create({
    model: MODEL,
    max_tokens: 6000,
    output_config: { effort: "medium" },
    system: `Kamu analis bisnis untuk pemilik ClipPost (bisnis 1 orang, modal terbatas). Bahasa Indonesia sederhana, langsung ke inti, pakai angka dari data. Jangan mengarang angka. Jangan membandingkan angka yang ditandai BELUM TERCATAT / TIDAK LENGKAP / null; sebutkan saja datanya belum lengkap. Jangan menebak penyebab tanpa data.\nFakta produk:\n${PRODUCT}`,
    messages: [{
      role: "user",
      content: `Rekap ${LABEL[period]} (WIB). Akun tes pemilik sudah dikeluarkan dari semua angka.\n\nPERIODE INI:\n${describe(data.current as Stats, data.range.from)}\n\nPERIODE SEBELUMNYA (panjang sama):\n${describe(data.previous as Stats, data.range.prevFrom)}\n\nPer hari 30 hari terakhir (null = belum tercatat, BUKAN nol; jangan dibandingkan):\n${JSON.stringify(data.daily)}\n\nTempel link habis ≤7 hari: ${JSON.stringify(data.expiring)}\n\nTo-do terbuka: ${JSON.stringify(todos.data ?? [])}\n\nTulis rekap dengan bagian: "Angka utama" (naik/turun dibanding periode sebelumnya), "Yang perlu diperhatikan", dan "3 tindakan berikutnya" (paling berdampak ke pendapatan dulu). Maksimal 250 kata. Teks biasa, tanpa tabel.`,
    }],
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  const report = await saveReport("recap", period, text, res.usage);
  return { report: { ...report, cost_usd: costUsd(MODEL, res.usage.input_tokens, res.usage.output_tokens) } };
}
