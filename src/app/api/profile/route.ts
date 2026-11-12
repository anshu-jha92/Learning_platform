import { NextResponse } from "next/server";
import { getProfile, listTurns } from "@/core/store";


export async function GET() {
  const [profile, turns] = await Promise.all([getProfile(), listTurns(500)]);
  return NextResponse.json({ profile, turns });
}
