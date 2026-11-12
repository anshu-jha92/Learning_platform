import { NextResponse } from "next/server";
import { CoachError } from "@/core/coach";
import { createRealtimeSession } from "@/core/realtime";
import { getProfile } from "@/core/store";
import type { Difficulty } from "@/core/scenarios";

/**
 * Mints a short-lived token for the browser's WebRTC connection to OpenAI.
 *
 * The long-lived OPENAI_API_KEY never leaves this server. The value returned here expires
 * in about a minute and is only good for opening one call.
 */
export async function POST(request: Request) {
  let body: { scenarioId?: string; difficulty?: Difficulty };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const profile = await getProfile();
    const session = await createRealtimeSession(
      body.scenarioId ?? "standup",
      body.difficulty ?? "normal",
      profile
    );
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof CoachError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/realtime/session]", error);
    return NextResponse.json(
      { error: `Could not start a live session: ${detail}` },
      { status: 500 }
    );
  }
}
