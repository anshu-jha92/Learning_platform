import { NextResponse } from "next/server";
import { isMockMode } from "@/core/mock";

/** Lets the UI say plainly whether answers are coming from a model or the rule engine. */
export async function GET() {
  return NextResponse.json({ mock: isMockMode() });
}
