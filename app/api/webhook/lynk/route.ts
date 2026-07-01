import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 1. KUNCI MASTER (Tanpa kompromi ke Anon Key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Wajib Service Role Key
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // 🚨 DETEKTOR UTAMA: Apapun yang dikirim Lynk, cetak di log Vercel!
    console.log("🔥 WEBHOOK MASUK DARI LYNK:", JSON.stringify(body, null, 2));
    
    // 2. Filter Event
    if (body.event === "payment.received" && body.data?.message_action === "SUCCESS") {
      
      const customerEmail = body.data?.message_data?.customer?.email;

      if (customerEmail) {
        // Gunakan supabaseAdmin yang sudah punya kekuatan Kunci Master
        const { data, error } = await supabaseAdmin
          .from('users_premium')
          .insert([
            { email: customerEmail }
          ]);

        if (error) {
          console.error("❌ Gagal insert ke Supabase:", error.message);
        } else {
          console.log(`✅ BERHASIL: Email ${customerEmail} resmi jadi Premium!`);
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