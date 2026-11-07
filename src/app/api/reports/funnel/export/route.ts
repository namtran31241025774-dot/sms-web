import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPipelineFunnelReport, exportPipelineReportCsv } from "@/lib/services/reports";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!can(user.role, "report.funnel") && user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id") ? Number(searchParams.get("team_id")) : undefined;
  const ownerId = searchParams.get("owner_id") ? Number(searchParams.get("owner_id")) : undefined;
  const fromDate = searchParams.get("from_date") || undefined;
  const toDate = searchParams.get("to_date") || undefined;

  const report = getPipelineFunnelReport({
    team_id: teamId,
    owner_id: ownerId,
    from_date: fromDate,
    to_date: toDate,
  });

  const csv = exportPipelineReportCsv(report);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pipeline-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
