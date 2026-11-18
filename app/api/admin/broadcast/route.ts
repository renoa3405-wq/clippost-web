// Broadcast WA bertahap: impor nomor, ambil batch berikutnya (yang belum pernah dikirimi dan belum bayar New Update),
// tandai terkirim. Setiap nomor hanya sekali, jadi tidak ada yang dikirimi dua kali.
import { NextResponse } from "next/server";
import { admin, authorized, deny, fail } from "../_lib";

const STATUSES = ["belum", "antri", "terkirim", "gagal", "jangan"];

function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

// Satu baris = satu kontak: nomor, email, nama dalam urutan bebas, dipisah koma / titik koma / tab
function parseLines(text: string) {
  const rows = new Map<string, { phone: string; email: string | null; name: string | null }>();
  let invalid = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const email = parts.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p))?.toLowerCase() ?? null;
    const phoneRaw = parts.find((p) => p !== email && /\d{8,}/.test(p.replace(/\D/g, "")));
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (!phone) { invalid++; continue; }
    const name = parts.find((p) => p !== email && p !== phoneRaw)?.slice(0, 100) ?? null;
    if (!rows.has(phone)) rows.set(phone, { phone, email, name });
  }
  return { rows: [...rows.values()], invalid };
}

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const p = new URL(req.url).searchParams;
    if (p.get("view") === "summary") {
      const { data, error } = await admin().rpc("admin_broadcast_summary");
      if (error) throw error;
      return NextResponse.json(data);
    }
    const batch = Number(p.get("batch")) || null;
    const limit = Math.min(Number(p.get("limit")) || 100, 2000);
    const { data, error } = await admin().rpc("admin_broadcast_list", {
      p_status: p.get("status") ?? "", p_batch: batch, p_q: (p.get("q") ?? "").trim(), p_limit: limit, p_offset: Number(p.get("offset")) || 0,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const body = (await req.json()) as { action: string; text?: string; source?: string; size?: number; name?: string; batch?: number; phone?: string; status?: string };
    const db = admin();

    if (body.action === "import") {
      const { rows, invalid } = parseLines(String(body.text ?? "").slice(0, 2_000_000));
      if (rows.length > 20000) return NextResponse.json({ error: "Maksimal 20.000 nomor sekali impor" }, { status: 400 });
      const source = String(body.source ?? "manual").slice(0, 40) || "manual";
      let added = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await db.from("broadcast_contacts")
          .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, source })), { onConflict: "phone", ignoreDuplicates: true }).select("phone");
        if (error) throw error;
        added += data?.length ?? 0;
      }
      return NextResponse.json({ added, existing: rows.length - added, invalid });
    }

    if (body.action === "take") {
      const { data: id, error } = await db.rpc("admin_broadcast_take", { p_size: Number(body.size) || 100, p_name: String(body.name ?? "") });
      if (error) throw error;
      return NextResponse.json({ batch: id });
    }

    if (body.action === "mark_sent" || body.action === "cancel") {
      const batch = Number(body.batch);
      if (!batch) return NextResponse.json({ error: "Batch kosong" }, { status: 400 });
      if (body.action === "mark_sent") {
        const now = new Date().toISOString();
        const r1 = await db.from("broadcast_contacts").update({ status: "terkirim", sent_at: now }).eq("batch_id", batch).eq("status", "antri");
        if (r1.error) throw r1.error;
        const r2 = await db.from("broadcast_batches").update({ sent_at: now }).eq("id", batch);
        if (r2.error) throw r2.error;
      } else {
        const r1 = await db.from("broadcast_contacts").update({ status: "belum", batch_id: null }).eq("batch_id", batch).eq("status", "antri");
        if (r1.error) throw r1.error;
        const { count } = await db.from("broadcast_contacts").select("phone", { count: "exact", head: true }).eq("batch_id", batch);
        if (!count) await db.from("broadcast_batches").delete().eq("id", batch);
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_status") {
      const phone = normalizePhone(String(body.phone ?? ""));
      const status = String(body.status ?? "");
      if (!phone || !STATUSES.includes(status)) return NextResponse.json({ error: "Nomor atau status tidak valid" }, { status: 400 });
      const patch: Record<string, unknown> = { status };
      if (status === "terkirim") patch.sent_at = new Date().toISOString();
      if (status === "belum") Object.assign(patch, { sent_at: null, batch_id: null });
      const { error } = await db.from("broadcast_contacts").update(patch).eq("phone", phone);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (e) { return fail(e); }
}
