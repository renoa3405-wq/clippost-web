import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const signature = request.headers.get("x-lynk-signature");
    
    // 1. Ambil data penting untuk verifikasi
    const data = body.data?.message_data;
    const refId = data?.refId;
    const amount = data?.totals?.grandTotal?.toString();
    const messageId = body.message_id;
    const merchantKey = process.env.LYNK_MERCHANT_KEY!;

    // 2. Verifikasi Signature (Sesuai dokumentasi)
    const signatureString = amount + refId + messageId + merchantKey;
    const calculatedSignature = crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');

    if (signature !== calculatedSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 3. Proses Pembayaran
    if (body.event === "payment.received" && data.message_action === "SUCCESS") {
      const email = data.customer.email.trim().toLowerCase();

      await supabaseAdmin
        .from('users')
        .upsert({ email, registered_at: new Date().toISOString(), is_premium: true }, { onConflict: 'email' });

      return NextResponse.json({ message: "Sukses" }, { status: 200 });
    }

    return NextResponse.json({ message: "Event diabaikan" }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}