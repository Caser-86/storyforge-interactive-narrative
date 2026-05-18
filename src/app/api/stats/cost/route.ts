import { NextResponse } from "next/server";
import { getDailyCost, isWithinBudget } from "@/lib/observability-persist";
import { apiError, ErrorCodes } from "@/lib/api-errors";
import { verifyAdminToken } from "@/lib/crypto";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    if (!verifyAdminToken(request.headers.get("authorization"))) {
      return apiError(ErrorCodes.UNAUTHORIZED, "Unauthorized", 401);
    }
  }

  const cost = getDailyCost();
  const withinBudget = isWithinBudget();

  return NextResponse.json({
    date: cost.date,
    llmTokens: cost.llmTokens,
    assetCalls: cost.assetCalls,
    llmCostEstimate: cost.llmCostEstimate,
    withinBudget,
    limits: {
      dailyTokenLimit: parseInt(process.env.DAILY_TOKEN_LIMIT || "1000000", 10),
      dailyAssetLimit: parseInt(process.env.DAILY_ASSET_LIMIT || "500", 10),
    },
  });
}
