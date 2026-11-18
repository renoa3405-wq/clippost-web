// Pembeli ClipPost (tabel users_premium): cari, aktivasi manual, perpanjang Basic, upgrade Pro, reset HP,
// aktifkan Tempel link, nonaktifkan.
import { NextResponse } from "next/server";
import { admin, authorized, deny, fail } from "../_lib";

const COLS = "id, email, tier, expires_at, device_id, last_login, paste_link_until, registered_at, v7_paid, trial_video_id";

function addMonths(from: Date, months: number): Date {
  const target = from.getMonth() + months;
  const last = new Date(from.getFullYear(), target + 1, 0).getDate();
  const d = new Date(from);
  d.setMonth(target, Math.min(from.getDate(), last));
  return d;
}

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
    let query = admin().from("users_premium").select(COLS).order("registered_at", { ascending: false, nullsFirst: false }).limit(100);
    if (q) query = query.ilike("email", `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ buyers: data });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const { action, email: raw, tier, months } = (await req.json()) as { action: string; email: string; tier?: "basic" | "pro"; months?: number };
    const email = String(raw ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
    const db = admin().from("users_premium");
    const { data: row } = await db.select(COLS).eq("email", email).maybeSingle();

    if (action === "activate") {
      // Aktivasi manual (mis. pembeli yang webhook-nya terlewat). Basic = 2 bulan dari sekarang.
      const t = tier === "pro" ? "pro" : "basic";
      const expires_at = t === "basic" ? addMonths(new Date(), 2).toISOString() : null;
      const { error } = await admin().from("users_premium").upsert({ email, tier: t, expires_at, device_id: null }, { onConflict: "email" });
      if (error) throw error;
    } else if (!row) {
      return NextResponse.json({ error: "Email tidak ditemukan" }, { status: 404 });
    } else if (action === "extend") {
      const base = row.expires_at && new Date(row.expires_at) > new Date() ? new Date(row.expires_at) : new Date();
      const { error } = await db.update({ tier: "basic", expires_at: addMonths(base, months ?? 2).toISOString() }).eq("email", email);
      if (error) throw error;
    } else if (action === "pro") {
      const { error } = await db.update({ tier: "pro", expires_at: null }).eq("email", email);
      if (error) throw error;
    } else if (action === "reset_device") {
      const { error } = await db.update({ device_id: null }).eq("email", email);
      if (error) throw error;
    } else if (action === "paste_link") {
      const base = row.paste_link_until && new Date(row.paste_link_until) > new Date() ? new Date(row.paste_link_until) : new Date();
      const { error } = await db.update({ paste_link_until: addMonths(base, months ?? 1).toISOString() }).eq("email", email);
      if (error) throw error;
    } else if (action === "deactivate") {
      // Nonaktifkan = masa aktif berakhir sekarang (data tetap ada, bisa diaktifkan lagi)
      const { error } = await db.update({ tier: "basic", expires_at: new Date().toISOString(), device_id: null }).eq("email", email);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    }
    const { data } = await admin().from("users_premium").select(COLS).eq("email", email).maybeSingle();
    return NextResponse.json({ buyer: data });
  } catch (e) { return fail(e); }
}
