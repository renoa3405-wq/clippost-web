// Inbox Bantuan: daftar percakapan pembeli, isi percakapan, dan balasan admin (tabel support_messages).
import { NextResponse } from "next/server";
import { admin, authorized, deny, fail } from "../_lib";

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const email = new URL(req.url).searchParams.get("email")?.toLowerCase();
    if (email) {
      const { data, error } = await admin().from("support_messages").select("*").eq("email", email).order("id");
      if (error) throw error;
      await admin().from("support_messages").update({ read_at: new Date().toISOString() }).eq("email", email).eq("from_admin", false).is("read_at", null);
      return NextResponse.json({ messages: data });
    }
    const { data, error } = await admin().from("support_messages").select("email, from_admin, body, created_at, read_at").order("id", { ascending: false }).limit(1000);
    if (error) throw error;
    const threads = new Map<string, { email: string; lastMessage: string; lastAt: string; lastFromAdmin: boolean; unread: number }>();
    for (const m of data ?? []) {
      const t = threads.get(m.email) ?? { email: m.email, lastMessage: m.body, lastAt: m.created_at, lastFromAdmin: m.from_admin, unread: 0 };
      if (!m.from_admin && !m.read_at) t.unread++;
      threads.set(m.email, t);
    }
    return NextResponse.json({ threads: [...threads.values()] });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const { email, body } = (await req.json()) as { email: string; body: string };
    const text = String(body ?? "").trim();
    if (!email || !text || text.length > 2000) return NextResponse.json({ error: "Pesan kosong atau terlalu panjang" }, { status: 400 });
    const { error } = await admin().from("support_messages").insert({ email: email.toLowerCase(), body: text, from_admin: true });
    if (error) throw error;
    return GET(new Request(`${new URL(req.url).origin}/api/admin/support?email=${encodeURIComponent(email)}`, { headers: req.headers }));
  } catch (e) { return fail(e); }
}
