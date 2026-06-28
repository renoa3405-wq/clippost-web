import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category, pattern, answer, password, confidence = 100, active = true } = body;

    // 1. Validasi Password Rahasia
    const secretPassword = process.env.ADMIN_SECRET_PASSWORD;
    if (!password || password !== secretPassword) {
      return NextResponse.json({ error: "Akses Ditolak! Password salah atau tidak disertakan." }, { status: 401 });
    }

    if (!category || !pattern || !answer) {
      return NextResponse.json({ error: "Category, pattern, dan answer wajib diisi!" }, { status: 400 });
    }

    // 2. Buat Vektor dari Pattern
    const textToEmbed = `Kategori: ${category}\nKonteks Pertanyaan: ${pattern}`;
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