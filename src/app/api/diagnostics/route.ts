import { NextResponse } from "next/server";
import { collectAuthoringDiagnostics, DiagnosticReportSchema } from "@/lib/authoring/diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const report = await collectAuthoringDiagnostics();
  return NextResponse.json(DiagnosticReportSchema.parse(report), { status: report.status === "error" ? 503 : 200 });
}
