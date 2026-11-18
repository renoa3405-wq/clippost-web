import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'crypto';

// 1. KUNCI MASTER (Tanpa kompromi ke Anon Key)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Wajib Service Role Key
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// Sistem 2 tier: Basic (Rp55rb, aktif 2 BULAN KALENDER) & Pro (Rp100rb,
// selamanya). Tier ditentukan dari JUDUL produk yang dibeli
// (data.message_data.items[0].title), BUKAN dari harga — harga bisa berubah
// karena promo/diskon/voucher, judul produk jauh lebih stabil. WAJIB ada
// kata kunci EKSPLISIT di judul produk Lynk.id: "BASIC" buat produk 55k,
// "PRO" buat produk 100k.
//
// SENGAJA TIDAK ada default/fallback tier — kalau judul produk gak
// mengandung salah satu kata kunci ini, webhook TIDAK menyentuh
// users_premium sama sekali (cuma nge-log warning). Ini penting kalau toko
// Lynk.id yang sama nanti jual produk LAIN yang gak ada hubungannya sama
// Canclip — tanpa pengecekan eksplisit ini, pembeli produk lain itu bisa
// KETULARAN dapet akses Canclip gratis tanpa sengaja.
const BASIC_DURATION_MONTHS = 2;

// "+2 bulan" TIDAK dihitung sebagai 60 hari tetap (itu meleset 1-2 hari
// tergantung bulan mana yang dilewati, misal beli 2 September + 60 hari =
// 1 November, padahal harusnya 2 November). Fungsi ini beneran nambah
// NOMOR BULAN kalender, dengan clamp ke tanggal terakhir bulan tujuan kalau
// tanggal aslinya gak ada di bulan itu (mis. 31 Jan + 1 bulan = 28/29 Feb,
// BUKAN overflow ke awal Maret kayak default `Date.setMonth()` JS).
function addCalendarMonths(date: Date, months: number): Date {
  const targetMonthIndex = date.getMonth() + months;
  const lastDayOfTargetMonth = new Date(date.getFullYear(), targetMonthIndex + 1, 0).getDate();
  const day = Math.min(date.getDate(), lastDayOfTargetMonth);
  const result = new Date(date);
  result.setFullYear(date.getFullYear());
  result.setMonth(targetMonthIndex);
  result.setDate(day);
  return result;
}

function resolveTier(productTitle: string): { tier: 'basic' | 'pro'; expiresAt: string | null } | null {
  const upper = productTitle.toUpperCase();

  // BASIC dicek dulu: "PRO" juga ada di kata lain (PROMO, PRODUK), jadi "BASIC Promo" tetap Basic.
  if (upper.includes('BASIC')) {
    const expires = addCalendarMonths(new Date(), BASIC_DURATION_MONTHS);
    return { tier: 'basic', expiresAt: expires.toISOString() };
  }

  if (upper.includes('PRO')) return { tier: 'pro', expiresAt: null };

  return null; // Produk gak dikenali — bukan produk Canclip, jangan disentuh.
}

// Produk langganan Tempel link: judul wajib mengandung "TEMPEL LINK" (atau "PASTE LINK"). Dicek sebelum BASIC/PRO.
const isPasteLink = (title: string) => /tempel\s*link|paste\s*link/i.test(title);

// Produk "Clippost UPDATE" (Rp20rb sekali bayar): pembeli lama boleh memakai v7 (users_premium.v7_paid). Judul wajib
// mengandung kata "UPDATE". Dicek sebelum BASIC/PRO, hanya untuk email yang sudah terdaftar.
const isUpdate = (title: string) => /\bupdate\b/i.test(title);

// Catatan order untuk dashboard admin (pendapatan, nomor WA). Gagal mencatat tidak menggagalkan aktivasi.
function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^628\d{7,12}$/.test(d) ? d : null;
}

function orderKind(title: string): string {
  if (isPasteLink(title)) return 'paste_link';
  if (isUpdate(title)) return 'update';
  const upper = title.toUpperCase();
  if (upper.includes('BASIC')) return 'basic';
  return upper.includes('PRO') || /sekali\s*bayar/i.test(title) ? 'pro' : 'lain';
}

async function recordOrder(body: any, productTitle: string) {
  const m = body?.data?.message_data;
  const amount = Math.round(Number(m?.totals?.grandTotal ?? 0)) || 0;
  const { error } = await supabaseAdmin.from('orders').upsert({
    ref_id: String(m?.refId ?? '') || null,
    email: String(m?.customer?.email ?? '').trim().toLowerCase() || null,
    name: String(m?.customer?.name ?? '').trim().slice(0, 100) || null,
    phone: normalizePhone(m?.customer?.phone),
    product: productTitle.slice(0, 200),
    kind: orderKind(productTitle),
    amount,
  }, { onConflict: 'ref_id', ignoreDuplicates: true });
  if (error) console.error("⚠️ Gagal mencatat order:", error.message);
}

// Hal yang perlu dicek manual masuk ke to-do dashboard admin
async function addTodo(title: string, detail: string, email: string) {
  const { error } = await supabaseAdmin.from('admin_todos').insert({ title, detail, area: 'pembayaran', priority: 'tinggi', emails: [email], source: 'webhook' });
  if (error) console.error("⚠️ Gagal membuat to-do:", error.message);
}

// Tanda tangan Lynk (dokumentasi: documenter.getpostman.com/view/3211564/2sB2cVf2Kp):
//   X-Lynk-Signature = sha256_hex(grandTotal + refId + message_id + merchantKey)
// Toko Lynk dipakai bersama Sribuklip: Lynk mengirim ke webhook Sribuklip, yang meneruskan body + tanda tangan
// aslinya ke sini. Merchant key-nya sama (LYNK_MERCHANT_KEY di Vercel = merchant key toko Lynk).
function verifyLynkSignature(raw: string, body: any, signature: string, merchantKey: string): boolean {
  const m = body?.data?.message_data;
  const refId = m?.refId;
  const messageId = body?.data?.message_id;
  const total = m?.totals?.grandTotal;
  if (typeof refId !== 'string' || typeof messageId !== 'string' || total === undefined || total === null) return false;
  const want = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want)) return false;
  // grandTotal dicoba persis seperti tertulis di body (mis. "72000.0") dan sebagai angka JS ("72000")
  const w = /"grandTotal"\s*:\s*(?:"([^"]*)"|(-?[0-9]+(?:\.[0-9]+)?))/.exec(raw);
  const asWritten = w?.[1] ?? w?.[2];
  const totals = [...new Set([String(total), ...(asWritten ? [asWritten] : [])])];
  return totals.some((t) => {
    const got = createHash('sha256').update(t + refId + messageId + merchantKey).digest();
    return timingSafeEqual(got, Buffer.from(want, 'hex'));
  });
}

export async function POST(request: Request) {
  try {
    // Boleh lebih dari satu toko Lynk (mis. toko sementara): isi merchant key-nya dipisah koma
    const merchantKeys = (process.env.LYNK_MERCHANT_KEY ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    if (!merchantKeys.length) {
      console.error("❌ LYNK_MERCHANT_KEY belum diisi di Vercel");
      return NextResponse.json({ success: false, status: "not_configured" }, { status: 503 });
    }

    const raw = await request.text();
    const body = JSON.parse(raw);

    // Tombol Test di dashboard Lynk mengirim test_event tanpa tanda tangan
    if (body?.event === "test_event") return NextResponse.json({ success: true, test: true }, { status: 200 });

    const signature = request.headers.get('x-lynk-signature') ?? '';
    if (!merchantKeys.some((key) => verifyLynkSignature(raw, body, signature, key))) {
      console.warn("⚠️ Tanda tangan Lynk tidak cocok, ditolak:", body?.data?.message_data?.refId ?? '');
      return NextResponse.json({ success: false, status: "signature" }, { status: 401 });
    }

    console.log("🔥 WEBHOOK MASUK DARI LYNK:", body?.data?.message_data?.refId ?? '');

    // 2. Filter Event
    if (body.event === "payment.received" && body.data?.message_action === "SUCCESS") {

      const customerEmail = body.data?.message_data?.customer?.email;
      const items = body.data?.message_data?.items;
      // Produk Sribuklip di toko yang sama bukan urusan ClipPost ("Sribuklip Pro" jangan sampai jadi ClipPost PRO)
      const item = Array.isArray(items) ? items.find((i: any) => i?.title && !/sribuklip/i.test(String(i.title))) : null;
      const productTitle = item ? String(item.title) : '';
      if (item) await recordOrder(body, productTitle);

      if (customerEmail && isPasteLink(productTitle)) {
        // Langganan Tempel link (Rp20rb/bulan): +1 bulan kalender dari sekarang atau dari sisa langganan yang masih
        // aktif. Hanya untuk email yang sudah punya ClipPost; tier dan kunci HP tidak disentuh.
        const email = customerEmail.trim().toLowerCase();
        const { data: row, error: readErr } = await supabaseAdmin.from('users_premium').select('paste_link_until, v7_paid').eq('email', email).maybeSingle();
        if (readErr) {
          console.error("❌ Gagal membaca users_premium:", readErr.message);
          return NextResponse.json({ success: false, status: "db" }, { status: 500 });
        }
        if (!row) {
          console.warn(`⚠️ PASTE_LINK_NO_ACCOUNT: ${email} membeli "${productTitle}" tapi belum punya ClipPost — cek manual / refund.`);
          await addTodo(`Tempel link dibeli, email tidak terdaftar: ${email}`, `Produk "${productTitle}". Email ini tidak ada di daftar pembeli ClipPost. Hubungi pembeli: salah ketik email, atau refund.`, email);
        } else {
          if (!row.v7_paid) await addTodo(`Tempel link dibeli sebelum New Update: ${email}`, `Pembeli Pro lama ini belum membayar New Update (Rp20.000), jadi setelah video uji coba aplikasinya terkunci. Langganan Tempel link tetap ditambah 1 bulan. Hubungi pembeli: bayar New Update, atau refund.`, email);
          const current = row.paste_link_until ? new Date(row.paste_link_until) : null;
          const from = current && current > new Date() ? current : new Date();
          const until = addCalendarMonths(from, 1).toISOString();
          const { error } = await supabaseAdmin.from('users_premium').update({ paste_link_until: until }).eq('email', email);
          if (error) {
            console.error("❌ Gagal menyimpan Tempel link:", error.message);
            return NextResponse.json({ success: false, status: "db" }, { status: 500 });
          }
          console.log(`✅ Tempel link ${email} aktif sampai ${until}`);
        }
      } else if (customerEmail && isUpdate(productTitle)) {
        const email = customerEmail.trim().toLowerCase();
        const { data: row, error } = await supabaseAdmin.from('users_premium').update({ v7_paid: true }).eq('email', email).select('id').maybeSingle();
        if (error) {
          console.error("❌ Gagal menyimpan update v7:", error.message);
          return NextResponse.json({ success: false, status: "db" }, { status: 500 });
        }
        if (!row) {
          console.warn(`⚠️ UPDATE_NO_ACCOUNT: ${email} membeli "${productTitle}" tapi belum punya ClipPost — cek manual / refund.`);
          await addTodo(`New Update dibeli, email tidak terdaftar: ${email}`, `Produk "${productTitle}". Email ini tidak ada di daftar pembeli ClipPost (mungkin beda email dengan saat beli Pro). Tanyakan email lamanya, lalu aktifkan manual.`, email);
        }
        else console.log(`✅ Update v7 aktif untuk ${email}`);
      } else if (customerEmail) {
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
                v7_paid: true,   // pembeli Basic/Pro baru (atau perpanjangan) langsung dapat v7
              },
              { onConflict: 'email' }
            );

          if (error) {
            console.error("❌ Gagal upsert ke Supabase:", error.message);
            // Jawab gagal supaya Lynk mengirim ulang (pembeli tidak hilang diam-diam)
            return NextResponse.json({ success: false, status: "db" }, { status: 500 });
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