import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Wajib Service Role Key
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// Lokasi file APK di Supabase Storage — bucket ini WAJIB dibuat PRIVATE
// (bukan public bucket), biar gak bisa diakses langsung tanpa signed URL.
const APK_BUCKET = 'releases';
const APK_PATH = 'clippost-latest.apk';
const LINK_EXPIRY_SECONDS = 60 * 60; // link cuma berlaku 1 jam

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Masukkan email yang valid.' },
        { status: 400 }
      );
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    const { data: premiumUser, error: lookupError } = await supabaseAdmin
      .from('users_premium')
      .select('email')
      .ilike('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error('❌ Gagal cek users_premium:', lookupError.message);
      return NextResponse.json(
        { success: false, error: 'Terjadi kesalahan server. Coba lagi.' },
        { status: 500 }
      );
    }

    // 🔥 CATAT SETIAP PERCOBAAN (berhasil maupun gagal) — email, IP, waktu,
    // status. Ini jejak audit kalau ada yang coba nebak-nebak email orang
    // lain, atau kalau nanti ketahuan ada link yang dibagi-bagi (bisa
    // dilacak dari pola IP/waktu-nya). Best-effort: gagal nyatet TIDAK
    // BOLEH bikin seluruh request gagal buat user yang sah.
    supabaseAdmin
      .from('download_logs')
      .insert([{ email, ip, success: !!premiumUser }])
      .then(({ error }) => {
        if (error) console.error('⚠️ Gagal catat download_logs:', error.message);
      });

    if (!premiumUser) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Email ini belum terdaftar sebagai pembeli Clippost Premium. Pastikan pakai email yang sama persis waktu checkout di Lynk.id.',
        },
        { status: 403 }
      );
    }

    const { data: signedUrlData, error: signError } = await supabaseAdmin.storage
      .from(APK_BUCKET)
      .createSignedUrl(APK_PATH, LINK_EXPIRY_SECONDS);

    if (signError || !signedUrlData?.signedUrl) {
      console.error('❌ Gagal generate signed URL:', signError?.message);
      return NextResponse.json(
        { success: false, error: 'Gagal menyiapkan link download. Coba lagi dalam beberapa saat.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: signedUrlData.signedUrl,
      expiresInSeconds: LINK_EXPIRY_SECONDS,
    });
  } catch (error) {
    console.error('❌ Error fatal /api/download:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan internal.' }, { status: 500 });
  }
}
