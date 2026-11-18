// Ringkasan dashboard admin
import { NextResponse } from "next/server";
import { authorized, deny, fail } from "../_lib";
import { overview } from "../_overview";

export async function GET(req: Request) {
  if (!authorized(req)) return deny();
  try {
    const p = new URL(req.url).searchParams.get("period");
    return NextResponse.json(await overview(p === "week" || p === "month" ? p : "day"));
  } catch (e) { return fail(e); }
}
