import { errorResponse, json } from "@/lib/authoring/api-contracts";
import { ProjectGenerationMetricsSchema } from "@/lib/authoring/metrics-contracts";
import { getProjectGenerationMetrics } from "@/lib/authoring/metrics";

type MetricsRouteContext = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: MetricsRouteContext): Promise<Response> {
  try {
    const { projectId } = await params;
    return json(ProjectGenerationMetricsSchema, await getProjectGenerationMetrics(projectId));
  } catch (error) {
    return errorResponse(error);
  }
}
