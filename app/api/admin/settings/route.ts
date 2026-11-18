// Pengaturan AI (ai_config) dan update aplikasi (app_updates). Mengganti model di sini langsung dipakai semua HP
// (app membaca ulang tiap 10 menit), tanpa update APK dan tanpa user mengisi ulang API key.
import { NextResponse } from "next/server";
import { admin, authorized, deny, fail } from "../_lib";

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const [{ data: ai, error: e1 }, { data: updates, error: e2 }] = await Promise.all([
      admin().from("ai_config").select("*").eq("id", 1).maybeSingle(),
      admin().from("app_updates").select("*").order("created_at", { ascending: false }).limit(5),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return NextResponse.json({ ai, updates });
  } catch (e) { return fail(e); }
}

const AI_FIELDS = ["ai_models", "model_limits", "whisper_models", "whisper_model", "line_format", "purchase_url", "paste_link_url"] as const;

export async function POST(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const body = (await req.json()) as { kind: "ai" | "update"; values: Record<string, unknown> };
    if (body.kind === "ai") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of AI_FIELDS) if (k in body.values) patch[k] = body.values[k];
      const models = patch.ai_models as Record<string, { models?: unknown }> | undefined;
      if (models) for (const [stage, v] of Object.entries(models)) {
        if (!Array.isArray(v?.models) || v.models.length === 0) return NextResponse.json({ error: `Tahap ${stage} harus punya minimal 1 model` }, { status: 400 });
      }
      const { error } = await admin().from("ai_config").update(patch).eq("id", 1);
      if (error) throw error;
    } else if (body.kind === "update") {
      const { version, apk_url, changelog } = body.values as { version?: string; apk_url?: string; changelog?: string };
      if (!version || !apk_url) return NextResponse.json({ error: "Versi dan link APK wajib diisi" }, { status: 400 });
      const { error } = await admin().from("app_updates").insert({ version, apk_url, changelog: changelog || null });
      if (error) throw error;
    }
    return GET(req);
  } catch (e) { return fail(e); }
}
