import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Memanggil kunci rahasia dari file .env nantinya
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Menerima Webhook Lynk.id:", body);

    const status = body.status || body.transaction_status;
    const emailPembeli = body.customer_email || body.email;

    // Hanya eksekusi jika status transaksi sukses
    if (status === 'success' || status === 'settlement') {
      if (!emailPembeli) {
        return NextResponse.json({ error: "Email pembeli tidak ditemukan" }, { status: 400 });
      }

      const emailBersih = emailPembeli.trim().toLowerCase();

      // Upsert: Masukkan email baru, atau abaikan jika sudah pernah masuk
      const { error } = await supabaseAdmin
        .from('users')
        .upsert({ 
          email: emailBersih, 
          registered_at: new Date().toISOString(),
          is_premium: true // Opsional, penanda tambahan saja
        }, { onConflict: 'email' }); 

      if (error) {
        console.error("Gagal simpan ke Supabase:", error.message);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      console.log(`✅ PEMBELI BARU TERCATAT: ${emailBersih}`);
      return NextResponse.json({ message: "Sukses mendaftarkan pembeli" }, { status: 200 });
    }

    return NextResponse.json({ message: "Status belum sukses, diabaikan" }, { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return NextResponse.json({ error: "Webhook handler gagal" }, { status: 500 });
  }
}