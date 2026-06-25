import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // 1. Coba ambil sebagai text dulu agar tidak gagal parsing
    const rawBody = await request.text();
    
    // 2. Log semua header biar kita tahu apa yang dikirim Lynk.id
    const headers: any = {};
    request.headers.forEach((value, key) => { headers[key] = value; });
    console.log("HEADERS DITERIMA:", headers);
    console.log("RAW BODY DITERIMA:", rawBody);

    // 3. Coba paksa jadi JSON kalau bisa
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      body = "Bukan JSON";
    }

    return NextResponse.json({ 
      message: "Data diterima",
      received_content: rawBody,
      headers: headers 
    }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}