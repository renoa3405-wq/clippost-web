import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Pastikan Environment Variable Supabase Bos sudah terpasang di Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    // 1. Tangkap datanya sebagai JSON (bukan text lagi)
    const body = await request.json();
    
    // 2. Filter: Pastikan ini benar-benar event pembayaran yang sukses
    if (body.event === "payment.received" && body.data.message_action === "SUCCESS") {
      
      // 3. Ekstrak email dari dalam payload Lynk.id
      const customerEmail = body.data.message_data.customer.email;

      if (customerEmail) {
        // 4. Tembakkan email tersebut ke tabel users_premium di Supabase
        const { data, error } = await supabase
          .from('users_premium')
          .insert([
            { email: customerEmail } // Pastikan nama kolom 'email' sesuai dengan yang ada di tabel Bos
          ]);

        if (error) {
          console.error("Gagal insert ke Supabase:", error);
        } else {
          console.log(`✅ BERHASIL: Email ${customerEmail} resmi jadi Premium!`);
        }
      }
    }

    // 5. Selalu balas Lynk.id dengan senyuman (Status 200 JSON)
    return NextResponse.json(
      { success: true, status: "Pembayaran diproses ke Supabase" }, 
      { status: 200 }
    );

  } catch (error) {
    console.error("Error webhook:", error);
    return NextResponse.json(
      { success: false, status: "Internal Error" }, 
      { status: 500 }
    );
  }
}


export async function GET() {
  return NextResponse.json({ success: true, status: "API Webhook Aktif 🚀" }, { status: 200 });
}