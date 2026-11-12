import { NextResponse } from "next/server";
import { isMockMode } from "@/core/mock";
import { storageKind } from "@/core/store";

/**
 * Lets the UI say plainly whether answers are coming from a model or the rule engine,
 * and where practice data is being kept.
 */
export async function GET() {
  return NextResponse.json({ mock: isMockMode(), storage: storageKind() });
}
