import { NextResponse } from "next/server";
import { byRecency, summarise } from "@/core/conversations";
import { listConversations } from "@/core/store";

/** The history list: summaries only, most recent first. */
export async function GET() {
  const all = await listConversations();
  return NextResponse.json({
    conversations: all.map(summarise).sort(byRecency),
  });
}
