import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function GET() {
  return NextResponse.json({ message: "Webhook is running" });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // LOG INI PENTING: Kita print semua data yang masuk biar Bos bisa cek di Vercel Log
    console.log("DATA DARI LYNK.ID:", JSON.stringify(body));

    // Sesuaikan field berdasarkan hasil log nanti
    const status = body.status || body.transaction_status || body.payment_status;
    const emailPembeli = body.customer_email || body.email || body.customer?.email;

    if (status === 'success' || status === 'settlement' || status === 'paid') {
      if (!emailPembeli) {
        return NextResponse.json({ error: "Email tidak ditemukan" }, { status: 400 });
      }

      const emailBersih = emailPembeli.trim().toLowerCase();

      const { error } = await supabaseAdmin
        .from('users')
        .upsert({ 
          email: emailBersih, 
          registered_at: new Date().toISOString(),
          is_premium: true 
        }, { onConflict: 'email' }); 

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ message: "Sukses" }, { status: 200 });
    }

    return NextResponse.json({ message: "Status belum sukses" }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}