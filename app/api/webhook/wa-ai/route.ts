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
// 2. TEMPLATE WAJIB
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
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: `Kamu adalah mesin pengklasifikasi pesan. 
Tugasmu HANYA mengklasifikasikan pesan ke dalam SALAH SATU kata ini:
- FAQ
- PAYMENT
- EMAIL_NOT_REGISTERED
- API_KEY
- BUG
- UNKNOWN
Pilih satu kata yang paling tepat tanpa penjelasan apapun.`
      },
      { role: "user", content: message }
    ]
  });
  
  return response.choices[0].message.content?.trim().toUpperCase() || "UNKNOWN";
}

// ==========================================
// FUNGSI 2: KNOWLEDGE RETRIEVAL
// ==========================================
async function searchKnowledgeBase(query: string) {
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data: matchedDocs, error } = await supabase.rpc('match_knowledge_base', {
    query_embedding: queryEmbedding,
    match_threshold: 0.75,
    match_count: 2
  });

  if (error || !matchedDocs || matchedDocs.length === 0) return null;
  return matchedDocs.map((doc: any) => `Kategori: ${doc.category}\nSolusi: ${doc.answer}`).join("\n\n---\n\n");
}

// ==========================================
// FUNGSI 3: GENERATE JAWABAN STRICT
// ==========================================
async function generateStrictAnswer(context: string, userMessage: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: `Kamu adalah AI Customer Support. ATURAN MUTLAK:
1. Jawab HANYA berdasarkan informasi di dalam <DATABASE_CONTEXT>.
2. DILARANG MENGARANG.
3. Jika tidak ada di konteks atau ragu, WAJIB membalas dengan kalimat persis berikut:
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
    
    const userMessage = payload.payload?.body || payload.body || "";
    const userWaNumber = payload.payload?.from || payload.from || "";
    const hasMedia = payload.payload?.hasMedia || false;

    if (!userMessage && !hasMedia) {
      return NextResponse.json({ success: true });
    }

    // ==========================================
    // FILTER NOMOR PERCOBAAN (SANDBOX MODE)
    // ==========================================
    const testNumber = "83178783790"; // Kita ambil angka belakangnya agar cocok dengan format WAHA (62831... atau 0831...)
    if (!userWaNumber.includes(testNumber)) {
      console.log(`[DIABAIKAN] Pesan dari nomor selain percobaan: ${userWaNumber}`);
      return NextResponse.json({ success: true, status: "Ignored, not test number" }, { status: 200 });
    }

    let finalResponse = "";

    if (hasMedia) {
      finalResponse = "Sistem sedang memverifikasi bukti pembayaran Anda...";
    } else {
      const intent = await detectIntent(userMessage);
      console.log(`[INTENT DETECTED]: ${intent}`);

      switch (intent) {
        case "EMAIL_NOT_REGISTERED":
          finalResponse = `Mohon kirimkan foto/screenshot bukti pembayaran dari Lynk.id Anda, disertai dengan mengetikkan alamat email yang ingin didaftarkan pada pesan yang sama.`;
          break;
        case "UNKNOWN":
          finalResponse = ADMIN_TEMPLATE;
          break;
        case "BUG":
        case "API_KEY":
        case "FAQ":
        case "PAYMENT":
          const dbContext = await searchKnowledgeBase(userMessage);
          if (!dbContext) {
            finalResponse = ADMIN_TEMPLATE;
          } else {
            finalResponse = await generateStrictAnswer(dbContext, userMessage);
          }
          break;
        default:
          finalResponse = ADMIN_TEMPLATE;
          break;
      }
    }

    // ==========================================
    // TEMBAK BALASAN KE WAHA (GEMBOK DIBUKA)
    // ==========================================
    const wahaApiUrl = process.env.WAHA_API_URL;
    if (wahaApiUrl) {
      await fetch(`${wahaApiUrl}/api/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ 
          chatId: userWaNumber, 
          text: finalResponse, 
          session: "default" 
        })
      });
      console.log(`[BERHASIL DIKIRIM KE WA]: ${finalResponse}`);
    } else {
      console.error("[ERROR] WAHA_API_URL belum disetting di Vercel!");
    }

    return NextResponse.json({ success: true, balasan_ai: finalResponse }, { status: 200 });

  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ success: false, status: "Error" }, { status: 500 });
  }
}