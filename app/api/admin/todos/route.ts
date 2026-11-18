// To-do admin: dari AI Bantuan, dari webhook (pembayaran janggal), atau ditulis manual. owner "cto" = urusan kode.
import { NextResponse } from "next/server";
import { admin, authorized, deny, fail } from "../_lib";

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const status = new URL(req.url).searchParams.get("status") ?? "baru";
    let q = admin().from("admin_todos").select("*").order("created_at", { ascending: false }).limit(300);
    if (status !== "semua") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ todos: data });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const { action, id, title, detail, owner, priority } = (await req.json()) as {
      action: string; id?: number; title?: string; detail?: string; owner?: string; priority?: string
    };
    const db = admin().from("admin_todos");
    let res;
    if (action === "add") {
      const t = String(title ?? "").trim();
      if (!t) return NextResponse.json({ error: "Judul kosong" }, { status: 400 });
      res = await db.insert({ title: t.slice(0, 300), detail: String(detail ?? "").slice(0, 3000), owner: owner === "cto" ? "cto" : "saya", priority: ["tinggi", "rendah"].includes(String(priority)) ? priority : "sedang" });
    } else if (action === "done") res = await db.update({ status: "selesai", done_at: new Date().toISOString() }).eq("id", id);
    else if (action === "reopen") res = await db.update({ status: "baru", done_at: null }).eq("id", id);
    else if (action === "owner") res = await db.update({ owner: owner === "cto" ? "cto" : "saya" }).eq("id", id);
    else if (action === "delete") res = await db.delete().eq("id", id);
    else return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    if (res.error) throw res.error;
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
