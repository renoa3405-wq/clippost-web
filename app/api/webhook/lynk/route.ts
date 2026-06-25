import { NextResponse } from 'next/server';

// Handle POST untuk webhook Lynk.id
export async function POST(request: Request) {
  const body = await request.text();
  console.log("=== LOG DARI POST ===");
  console.log("BODY:", body);
  return NextResponse.json({ status: "POST Diterima" });
}

// Handle GET supaya kita bisa tes via browser
export async function GET() {
  console.log("=== LOG DARI GET ===");
  return NextResponse.json({ status: "API Berjalan" });
}