// AI dashboard admin (Claude). Hanya dipanggil saat admin menekan tombol, jadi biaya token terkendali.
// ANTHROPIC_API_KEY di Vercel env; ANTHROPIC_MODEL opsional untuk mengganti model tanpa ubah kode.
import Anthropic from "@anthropic-ai/sdk";
import { admin } from "./_lib";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Harga per 1 juta token (USD), hanya untuk menampilkan perkiraan biaya di dashboard
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5], "claude-fable-5-1": [10, 50],
};
export const costUsd = (model: string, input: number, output: number) => {
  const [i, o] = PRICE[model] ?? [4, 20];
  return (input * i + output * o) / 1_000_000;
};

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY belum diisi di Vercel env");
  if (!client) client = new Anthropic();
  return client;
}

export function aiError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "API key Anthropic tidak valid (cek ANTHROPIC_API_KEY di Vercel)";
  if (e instanceof Anthropic.RateLimitError) return "Batas pemakaian Anthropic tercapai, coba lagi sebentar lagi";
  if (e instanceof Anthropic.APIError) return `Anthropic error ${e.status}: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export async function saveReport(kind: string, period: string | null, content: string, usage: { input_tokens: number; output_tokens: number }) {
  const { data, error } = await admin().from("admin_ai_reports")
    .insert({ kind, period, content, model: MODEL, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens })
    .select("*").single();
  if (error) throw error;
  return data;
}

// Fakta produk untuk AI. Perbarui di sini kalau harga atau alur berubah.
export const PRODUCT = `ClipPost adalah aplikasi Android (APK, bukan Play Store) yang mengubah video panjang (podcast, YouTube) jadi klip pendek dengan hook, subtitle, dan B-roll. Proses berjalan di HP pembeli.
- Paket: Basic Rp55.000 aktif 2 bulan; Pro Rp100.000 aktif selamanya. Dibeli di Lynk (lynk.id/clipcash). Login dengan akun Google yang emailnya sama dengan email saat membeli.
- Versi baru "New Update" (v7). Pembeli Basic dan pembeli baru langsung dapat. Pembeli Pro lama: 1 video uji coba gratis (maks 1 jam video, AI dari ClipPost), setelah itu wajib bayar New Update Rp20.000 sekali.
- Setelah New Update, pembeli memakai API key Groq miliknya sendiri (gratis, console.groq.com/keys). Kuota Groq harian bisa habis; video menunggu di antrean lalu lanjut sendiri.
- B-roll butuh API key Pexels atau Pixabay. Pexels sedang menutup pendaftaran key baru, jadi pakai Pixabay (tersedia mulai versi 7.0.1) atau matikan B-roll.
- Tempel link (proses dari link YouTube tanpa download manual): Rp15.000/bulan, hanya setelah New Update. Untuk video uji coba gratis.
- Akun terkunci ke 1 HP; pindah HP otomatis bisa 1x per 30 hari.
- Supaya proses tetap jalan saat layar mati: izinkan ClipPost berjalan di latar belakang (tab Akun, "Atur izin latar belakang").
- Download APK terbaru: sribuklip.com/dl`;
