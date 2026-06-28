import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Wajib pakai Service Role agar punya hak Admin
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category, pattern, answer, confidence = 100, active = true } = body;

    if (!category || !pattern || !answer) {
      return NextResponse.json({ error: "Category, pattern, dan answer wajib diisi!" }, { status: 400 });
    }

    // 1. Jadikan Pattern + Category sebagai "Target Tembakan" Vektor
    const textToEmbed = `Kategori: ${category}\nKonteks Pertanyaan: ${pattern}`;

    // 2. Minta OpenAI menerjemahkan teks tersebut jadi Vektor (Angka)
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textToEmbed,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 3. Masukkan ke Supabase
    const { error } = await supabase
      .from('knowledge_base')
      .insert([{ category, pattern, answer, confidence, active, embedding }]);

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      message: "✅ FAQ berhasil ditanamkan ke Otak AI!" 
    }, { status: 200 });

  } catch (error) {
    console.error("Error Admin KB:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}