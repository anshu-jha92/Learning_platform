import { NextResponse } from "next/server";
import { deleteConversation, getConversation, saveConversation } from "@/core/store";
import { summarise } from "@/core/conversations";

type Params = { params: Promise<{ id: string }> };

/** Reopen one saved conversation. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "That conversation is gone." }, { status: 404 });
  }
  return NextResponse.json({ conversation });
}

/**
 * Delete it, and the turns it produced along with it. Keeping the learning data would
 * mean the coach carried on citing mistakes from a session you asked to erase.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await deleteConversation(id);
  return NextResponse.json({ ok: true, ...removed });
}

/** Rename or pin. Only the fields sent are touched. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: { title?: string | null; pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const conversation = await getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "That conversation is gone." }, { status: 404 });
  }

  if (body.title !== undefined) {
    const trimmed = body.title?.trim();
    // An empty name is a request to go back to the scenario label, not to store "".
    if (trimmed) conversation.title = trimmed.slice(0, 80);
    else delete conversation.title;
  }
  if (typeof body.pinned === "boolean") {
    if (body.pinned) conversation.pinned = true;
    else delete conversation.pinned;
  }

  await saveConversation(conversation);
  return NextResponse.json({ ok: true, conversation: summarise(conversation) });
}
