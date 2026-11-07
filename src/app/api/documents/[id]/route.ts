import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { can } from "@/lib/rbac";
import { userActor } from "@/lib/services/core";
import { readDocumentFile } from "@/lib/services/documents";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "document.read")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const file = readDocumentFile(userActor(user), Number((await params).id));
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof DomainError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
