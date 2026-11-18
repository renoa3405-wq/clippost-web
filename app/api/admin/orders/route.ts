// Order Lynk: daftar order (untuk dicocokkan dengan Lynk) dan impor ekspor xlsx Lynk (diparsing di browser).
// Impor: produk Sribuklip dilewati, order yang sudah dicatat webhook tidak dihitung dua kali, tanggal bayar New Update
// diisi dari order, dan nomor WA masuk daftar Broadcast (status "belum").
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { admin, authorized, deny, fail } from "../_lib";

type Row = { ref_id?: string | null; created_at: string; email?: string | null; name?: string | null; phone?: string | null; product: string; amount: number };

function normalizePhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

// Sama dengan webhook Lynk
function orderKind(title: string): string | null {
  if (/sribuklip/i.test(title)) return null;
  if (/tempel\s*link|paste\s*link/i.test(title)) return "paste_link";
  if (/\bupdate\b/i.test(title)) return "update";
  const upper = title.toUpperCase();
  return upper.includes("BASIC") ? "basic" : upper.includes("PRO") ? "pro" : "lain";
}

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const p = new URL(req.url).searchParams;
    let q = admin().from("orders").select("*").order("created_at", { ascending: false }).limit(Math.min(Number(p.get("limit")) || 200, 1000));
    if (p.get("from")) q = q.gte("created_at", p.get("from")!);
    if (p.get("to")) q = q.lt("created_at", p.get("to")!);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ orders: data });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const body = (await req.json()) as { action: string; rows?: Row[]; dryRun?: boolean };
    if (body.action !== "import" || !Array.isArray(body.rows)) return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
    if (body.rows.length > 20000) return NextResponse.json({ error: "Maksimal 20.000 baris sekali impor" }, { status: 400 });
    const db = admin();

    // Order sejak webhook mulai mencatat sudah ada; dari ekspor hanya diambil yang lebih lama
    const { data: first } = await db.from("orders").select("created_at").eq("source", "webhook").order("created_at").limit(1).maybeSingle();
    const cutoff = first ? new Date(first.created_at).getTime() : Infinity;

    const out: Record<string, unknown>[] = [];
    let sribuklip = 0, afterCutoff = 0, invalid = 0;
    for (const r of body.rows) {
      const t = new Date(r.created_at).getTime();
      const product = String(r.product ?? "").trim();
      const amount = Math.round(Number(r.amount));
      if (!Number.isFinite(t) || !product || !Number.isFinite(amount) || amount < 0) { invalid++; continue; }
      const kind = orderKind(product);
      if (!kind) { sribuklip++; continue; }
      if (t >= cutoff) { afterCutoff++; continue; }
      const email = String(r.email ?? "").trim().toLowerCase() || null;
      const ref = String(r.ref_id ?? "").trim() ||
        "lynkx:" + createHash("sha1").update([new Date(t).toISOString(), email, product, amount].join("|")).digest("hex").slice(0, 20);
      out.push({ ref_id: ref, created_at: new Date(t).toISOString(), email, name: String(r.name ?? "").trim().slice(0, 100) || null,
        phone: normalizePhone(r.phone), product: product.slice(0, 200), kind, amount, source: "lynk-export" });
    }

    // Dalam satu file ref yang sama hanya dihitung sekali
    const unique = [...new Map(out.map((o) => [o.ref_id as string, o])).values()];
    const dupInFile = out.length - unique.length;
    if (body.dryRun) {
      const { data: existing } = await db.from("orders").select("ref_id").in("ref_id", unique.slice(0, 5000).map((o) => o.ref_id as string));
      const have = new Set((existing ?? []).map((e) => e.ref_id));
      const fresh = unique.filter((o) => !have.has(o.ref_id as string));
      const byKind: Record<string, { n: number; amount: number }> = {};
      for (const o of fresh) { const k = o.kind as string; byKind[k] = { n: (byKind[k]?.n ?? 0) + 1, amount: (byKind[k]?.amount ?? 0) + (o.amount as number) }; }
      return NextResponse.json({ fresh: fresh.length, already: unique.length - fresh.length, dupInFile, sribuklip, afterCutoff, invalid, byKind,
        cutoff: Number.isFinite(cutoff) ? new Date(cutoff).toISOString() : null });
    }

    let added = 0;
    for (let i = 0; i < unique.length; i += 500) {
      const { data, error } = await db.from("orders").upsert(unique.slice(i, i + 500), { onConflict: "ref_id", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      added += data?.length ?? 0;
    }

    // Tanggal bayar New Update (kolom baru) diisi dari order Lynk yang paling awal
    const firstUpdate = new Map<string, string>();
    for (const o of unique) if (o.kind === "update" && o.email) {
      const prev = firstUpdate.get(o.email as string);
      if (!prev || (o.created_at as string) < prev) firstUpdate.set(o.email as string, o.created_at as string);
    }
    for (const [email, at] of firstUpdate) await db.from("users_premium").update({ v7_paid_at: at }).eq("email", email).is("v7_paid_at", null);

    // Nomor WA ke daftar Broadcast (yang sudah ada tidak diubah statusnya)
    const contacts = [...new Map(unique.filter((o) => o.phone).map((o) => [o.phone as string, { phone: o.phone, email: o.email, name: o.name, source: "lynk" }])).values()];
    let contactsAdded = 0;
    for (let i = 0; i < contacts.length; i += 500) {
      const { data, error } = await db.from("broadcast_contacts").upsert(contacts.slice(i, i + 500), { onConflict: "phone", ignoreDuplicates: true }).select("phone");
      if (error) throw error;
      contactsAdded += data?.length ?? 0;
    }
    return NextResponse.json({ added, already: unique.length - added, dupInFile, sribuklip, afterCutoff, invalid, contactsAdded });
  } catch (e) { return fail(e); }
}
