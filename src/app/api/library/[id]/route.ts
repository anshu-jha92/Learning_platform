import { NextResponse } from "next/server";
import { removeLibraryEntry } from "@/core/store";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const removed = await removeLibraryEntry(id);
  return NextResponse.json({ ok: removed });
}
