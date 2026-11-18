// Pembantu bersama untuk API admin ClipPost: cek password admin (header x-admin-password) dan klien Supabase
// service role. Service role key hanya dipakai di server (Vercel env), tidak pernah dikirim ke browser.
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

let client: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return client;
}

export function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET_PASSWORD ?? "";
  const given = req.headers.get("x-admin-password") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const deny = () => NextResponse.json({ error: "Password admin salah" }, { status: 401 });
export const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, { status: 500 });
