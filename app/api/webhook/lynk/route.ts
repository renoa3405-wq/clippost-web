import { NextResponse } from 'next/server';

// Handle POST untuk webhook Lynk.id
export async function POST(request: Request) {
  try {
    const body = await request.text();
    console.log("=== LOG DARI POST ===");
    console.log("BODY:", body);
    
    // Wajibkan balasan berstatus 200 OK dengan format JSON
    return NextResponse.json(
      { success: true, status: "POST Diterima" }, 
      { status: 200 }
    );
  } catch (error) {
    // Kalau ada error, tetap balas JSON supaya Lynk.id tidak marah terima HTML
    console.error("Error reading body:", error);
    return NextResponse.json(
      { success: false, status: "Internal Error" }, 
      { status: 500 }
    );
  }
}

// Handle GET supaya kita bisa tes via browser
export async function GET() {
  console.log("=== LOG DARI GET ===");
  return NextResponse.json(
    { success: true, status: "API Berjalan" },
    { status: 200 }
  );
}