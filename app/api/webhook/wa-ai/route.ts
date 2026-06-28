import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ==========================================
// 1. INISIALISASI MESIN UTAMA
// ==========================================
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==========================================
// 2. TEMPLATE WAJIB (DILARANG UBAH)
// ==========================================
const ADMIN_TEMPLATE = `Terima kasih sudah menghubungi kami.
Saat ini admin sedang offline dan akan online kembali mulai pukul 15.30 WIB.
Mohon kirim:
• Screenshot (jika ada error)
• Email akun
• Penjelasan singkat masalah
Agar saat admin online masalah dapat langsung diproses.`;

// ==========================================
// FUNGSI 1: SMART INTENT DETECTION
// ==========================================
async function detectIntent(message: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.0, // Harus 0 agar tidak mengarang
    messages: [
      {
        role: "system",
        content: `Kamu adalah mesin pengklasifikasi pesan. 
Tugasmu HANYA membaca pesan user dan mengklasifikasikannya ke dalam SALAH SATU kata ini (tanpa tanda kutip, tanpa penjelasan lain):
- FAQ (Jika bertanya Harga, Cara beli, Cara download, Cara instal, Cara penggunaan, Tutorial, Fitur, Komunitas, Download APK, Device support, Limit penggunaan, Update, Promo, APK terdeteksi berbahaya)
- PAYMENT (Jika bertanya seputar metode pembayaran secara umum)
- EMAIL_NOT_REGISTERED (Jika user bilang "sudah bayar tapi email belum bisa login", atau keluhan serupa)
- API_KEY (Jika masalah tentang API Key atau API Key Invalid)
- BUG (Jika melaporkan error sistem atau aplikasi tidak berjalan semestinya)
- UNKNOWN (Jika di luar topik di atas atau membingungkan)

Pilih satu kata yang paling tepat.`
      },
      { role: "user", content: message }
    ]
  });
  
  return response.choices[0].message.content?.trim().toUpperCase() || "UNKNOWN";
}

// ==========================================
// FUNGSI 2: KNOWLEDGE RETRIEVAL (DATABASE FIRST)
// ==========================================
async function searchKnowledgeBase(query: string) {
  // Ubah teks ke Vektor
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // Cari di database (pastikan fungsi match_knowledge_base sudah ada di Supabase)
  const { data: matchedDocs, error } = await supabase.rpc('match_knowledge_base', {
    query_embedding: queryEmbedding,
    match_threshold: 0.75, // Minimal kemiripan 75%
    match_count: 2
  });

  if (error || !matchedDocs || matchedDocs.length === 0) return null;
  
  // Gabungkan hasil pencarian
  return matchedDocs.map((doc: any) => `Kategori: ${doc.category}\nSolusi: ${doc.answer}`).join("\n\n---\n\n");
}

// ==========================================
// FUNGSI 3: GENERATE JAWABAN STRICT (ANTI NGARANG)
// ==========================================
async function generateStrictAnswer(context: string, userMessage: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: `Kamu adalah AI Customer Support. ATURAN MUTLAK:
1. Jawab HANYA berdasarkan informasi di dalam <DATABASE_CONTEXT> di bawah ini.
2. DILARANG MENGARANG, menebak, atau memberi asumsi.
3. Jika jawaban tidak ada di dalam <DATABASE_CONTEXT>, ATAU kamu ragu (confidence rendah), KAMU WAJIB membalas dengan kalimat persis berikut:
"${ADMIN_TEMPLATE}"

<DATABASE_CONTEXT>
${context}
</DATABASE_CONTEXT>`
      },
      { role: "user", content: userMessage }
    ]
  });

  return response.choices[0].message.content || ADMIN_TEMPLATE;
}


// ==========================================
// MAIN WEBHOOK HANDLER
// ==========================================
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    // Asumsi payload dari WAHA
    const userMessage = payload.payload?.body || payload.body || "";
    const userWaNumber = payload.payload?.from || payload.from || "";
    const hasMedia = payload.payload?.hasMedia || false; // Untuk deteksi struk pembayaran

    if (!userMessage && !hasMedia) {
      return NextResponse.json({ success: true });
    }

    let finalResponse = "";

    // -- ALUR KHUSUS VERIFIKASI EMAIL (MENERIMA GAMBAR + EMAIL) --
    if (hasMedia) {
      // NANTI DI SINI KITA MASUKKAN LOGIKA GEMINI VISION
      // Untuk mengecek resi Lynk.id + validasi teks email
      finalResponse = "Sistem sedang memverifikasi bukti pembayaran Anda...";
      return NextResponse.json({ success: true, balasan_ai: finalResponse }, { status: 200 });
    }

    // 1. INTENT DETECTION
    const intent = await detectIntent(userMessage);
    console.log(`[INTENT DETECTED]: ${intent}`);

    // 2. ROUTING BERDASARKAN INTENT
    switch (intent) {
      case "EMAIL_NOT_REGISTERED":
        // Aturan poin 6: Minta bukti dan email
        finalResponse = `Mohon kirimkan foto/screenshot bukti pembayaran dari Lynk.id Anda, disertai dengan mengetikkan alamat email yang ingin didaftarkan pada pesan yang sama.`;
        break;

      case "UNKNOWN":
        // Aturan poin 4: Langsung Admin
        finalResponse = ADMIN_TEMPLATE;
        break;

      case "BUG":
      case "API_KEY":
      case "FAQ":
      case "PAYMENT":
        // Aturan poin 1, 3, & 7: Knowledge Retrieval
        const dbContext = await searchKnowledgeBase(userMessage);
        
        if (!dbContext) {
          // Jika tidak nemu di DB sama sekali -> Admin
          finalResponse = ADMIN_TEMPLATE;
        } else {
          // Jika nemu -> Uji Confidence dengan LLM (Aturan poin 8 & 9)
          finalResponse = await generateStrictAnswer(dbContext, userMessage);
        }
        break;

      default:
        finalResponse = ADMIN_TEMPLATE;
        break;
    }

    // 3. LOG & KIRIM BALASAN KE WAHA (Buka komen ini jika WAHA sudah aktif)
    /*
    const wahaApiUrl = process.env.WAHA_API_URL;
    await fetch(`${wahaApiUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ chatId: userWaNumber, text: finalResponse, session: "default" })
    });
    */

    console.log(`[USER]: ${userMessage}`);
    console.log(`[AI]: ${finalResponse}`);

    return NextResponse.json({ success: true, balasan_ai: finalResponse }, { status: 200 });

  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ success: false, status: "Error" }, { status: 500 });
  }
}