// Inbox Bantuan: daftar percakapan pembeli, isi percakapan, balasan admin (tabel support_messages), dan balas massal
// (satu jawaban per topik dikirim ke semua pembeli yang bertanya hal itu).
import { NextResponse } from "next/server";
import { admin, authorized, deny, fail } from "../_lib";

type Thread = { email: string; lastMessage: string; lastAt: string; lastFromAdmin: boolean; unread: number };

async function threads(): Promise<Thread[]> {
  const { data, error } = await admin().from("support_messages").select("email, from_admin, body, created_at, read_at").order("id", { ascending: false }).limit(5000);
  if (error) throw error;
  const map = new Map<string, Thread>();
  for (const m of data ?? []) {
    const t = map.get(m.email) ?? { email: m.email, lastMessage: m.body, lastAt: m.created_at, lastFromAdmin: m.from_admin, unread: 0 };
    if (!m.from_admin && !m.read_at) t.unread++;
    map.set(m.email, t);
  }
  return [...map.values()];
}

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const p = new URL(req.url).searchParams;
    const email = p.get("email")?.toLowerCase();
    if (email) {
      const { data, error } = await admin().from("support_messages").select("*").eq("email", email).order("id");
      if (error) throw error;
      if (p.get("markRead") !== "0") await admin().from("support_messages").update({ read_at: new Date().toISOString() }).eq("email", email).eq("from_admin", false).is("read_at", null);
      return NextResponse.json({ messages: data });
    }
    if (p.get("groups")) {
      // Kelompok topik terakhir dari AI, hanya pembeli yang MASIH menunggu balasan
      const waiting = new Set((await threads()).filter((t) => !t.lastFromAdmin).map((t) => t.email));
      const { data } = await admin().from("admin_ai_reports").select("content, created_at").eq("kind", "groups").order("id", { ascending: false }).limit(1).maybeSingle();
      let topics: { judul: string; ringkasan: string; emails: string[]; saran_jawaban: string }[] = [];
      try { topics = data ? JSON.parse(data.content).topics : []; } catch { topics = []; }
      topics = topics.map((t) => ({ ...t, emails: t.emails.filter((e) => waiting.has(e)) })).filter((t) => t.emails.length);
      const covered = new Set(topics.flatMap((t) => t.emails));
      return NextResponse.json({ topics, createdAt: data?.created_at ?? null, waiting: waiting.size, notGrouped: [...waiting].filter((e) => !covered.has(e)) });
    }
    return NextResponse.json({ threads: await threads() });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const body = (await req.json()) as { email?: string; body?: string; bulk?: { email: string; body: string }[] };
    const db = admin().from("support_messages");

    if (Array.isArray(body.bulk)) {
      const rows = body.bulk.map((b) => ({ email: String(b.email ?? "").trim().toLowerCase(), body: String(b.body ?? "").trim(), from_admin: true }));
      if (!rows.length || rows.length > 500 || rows.some((r) => !r.email || !r.body || r.body.length > 4000)) {
        return NextResponse.json({ error: "Pesan kosong atau terlalu panjang" }, { status: 400 });
      }
      const { error } = await db.insert(rows);
      if (error) throw error;
      await admin().from("support_messages").update({ read_at: new Date().toISOString() })
        .in("email", rows.map((r) => r.email)).eq("from_admin", false).is("read_at", null);
      return NextResponse.json({ sent: rows.length });
    }

    const email = String(body.email ?? "").toLowerCase();
    const text = String(body.body ?? "").trim();
    if (!email || !text || text.length > 4000) return NextResponse.json({ error: "Pesan kosong atau terlalu panjang" }, { status: 400 });
    const { error } = await db.insert({ email, body: text, from_admin: true });
    if (error) throw error;
    return GET(new Request(`${new URL(req.url).origin}/api/admin/support?email=${encodeURIComponent(email)}`, { headers: req.headers }));
  } catch (e) { return fail(e); }
}
