import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Ambil teks mentah (Raw body)
    const rawBody = await request.text();
    console.log("RAW BODY DITERIMA:", rawBody);
    
    // Coba parse ke JSON
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.log("Bukan JSON, mungkin form-data");
      return NextResponse.json({ message: "Bukan JSON" }, { status: 400 });
    }

    console.log("JSON PARSED:", JSON.stringify(body));

    return NextResponse.json({ message: "Diterima sukses" }, { status: 200 });
  } catch (error: any) {
    console.error("ERROR:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}