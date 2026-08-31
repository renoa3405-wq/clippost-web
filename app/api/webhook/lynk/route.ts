import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 1. KUNCI MASTER (Tanpa kompromi ke Anon Key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Wajib Service Role Key
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// Sistem 2 tier: Basic (Rp55rb, aktif 60 hari) & Pro (Rp100rb, selamanya).
// Tier ditentukan dari JUDUL produk yang dibeli (data.message_data.items[0].title),
// BUKAN dari harga — harga bisa berubah karena promo/diskon/voucher, judul
// produk jauh lebih stabil. WAJIB ada kata kunci EKSPLISIT di judul produk
// Lynk.id: "BASIC" buat produk 55k, "PRO" buat produk 100k.
//
// SENGAJA TIDAK ada default/fallback tier — kalau judul produk gak
// mengandung salah satu kata kunci ini, webhook TIDAK menyentuh
// users_premium sama sekali (cuma nge-log warning). Ini penting kalau toko
// Lynk.id yang sama nanti jual produk LAIN yang gak ada hubungannya sama
// Canclip — tanpa pengecekan eksplisit ini, pembeli produk lain itu bisa
// KETULARAN dapet akses Canclip gratis tanpa sengaja.
const BASIC_DURATION_DAYS = 60;

function resolveTier(productTitle: string): { tier: 'basic' | 'pro'; expiresAt: string | null } | null {
  const upper = productTitle.toUpperCase();

  if (upper.includes('PRO')) return { tier: 'pro', expiresAt: null };

  if (upper.includes('BASIC')) {
    const expires = new Date();
    expires.setDate(expires.getDate() + BASIC_DURATION_DAYS);
    return { tier: 'basic', expiresAt: expires.toISOString() };
  }

  return null; // Produk gak dikenali — bukan produk Canclip, jangan disentuh.
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 🚨 DETEKTOR UTAMA: Apapun yang dikirim Lynk, cetak di log Vercel!
    console.log("🔥 WEBHOOK MASUK DARI LYNK:", JSON.stringify(body, null, 2));

    // 2. Filter Event
    if (body.event === "payment.received" && body.data?.message_action === "SUCCESS") {

      const customerEmail = body.data?.message_data?.customer?.email;
      const items = body.data?.message_data?.items;
      const productTitle = Array.isArray(items) && items[0]?.title ? String(items[0].title) : '';

      if (customerEmail) {
        const resolved = resolveTier(productTitle);

        if (!resolved) {
          console.log(`⚠️ Produk "${productTitle}" gak mengandung kata kunci BASIC/PRO — dilewati, users_premium TIDAK disentuh.`);
        } else {
          const { tier, expiresAt } = resolved;

          // Upsert (BUKAN insert) — email yang sama bisa bayar lagi
          // (perpanjang Basic, atau upgrade ke Pro), gak boleh bikin baris
          // duplikat. device_id di-reset ke null tiap kali bayar —
          // perpanjangan/upgrade dianggap aktivasi baru, bisa login di HP
          // manapun lagi (gak perlu DM admin buat lepas kunci device lama).
          const { error } = await supabaseAdmin
            .from('users_premium')
            .upsert(
              {
                email: customerEmail.trim().toLowerCase(),
                tier,
                expires_at: expiresAt,
                device_id: null,
              },
              { onConflict: 'email' }
            );

          if (error) {
            console.error("❌ Gagal upsert ke Supabase:", error.message);
          } else {
            console.log(`✅ BERHASIL: Email ${customerEmail} jadi tier '${tier}'${expiresAt ? ` (aktif sampai ${expiresAt})` : ' (selamanya)'}! Produk: "${productTitle}"`);
          }
        }
      } else {
         console.log("⚠️ Email tidak ditemukan di dalam payload Lynk.");
      }
    } else {
      console.log(`⚠️ Data masuk, tapi bukan pembayaran sukses. Event: ${body.event}`);
    }

    return NextResponse.json(
      { success: true, status: "Webhook diterima" },
      { status: 200 }
    );

  } catch (error) {
    console.error("❌ Error webhook fatal:", error);
    return NextResponse.json(
      { success: false, status: "Internal Error" },
      { status: 500 }
    );
  }
}


export async function GET() {
  return NextResponse.json({ success: true, status: "API Webhook Aktif 🚀" }, { status: 200 });
}