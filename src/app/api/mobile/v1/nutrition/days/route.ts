import { NextResponse, type NextRequest } from "next/server";
import { handleMobileAuthenticatedRequest, MobileApiValidationError } from "@/lib/mobile-api/auth";
import { shiftHistoryDate } from "@/lib/mobile-api/history-contract";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { parseNutritionDate } from "@/lib/mobile-api/nutrition-day";
import { readMobileNutritionDay } from "@/lib/mobile-api/nutrition-day-server";
import { authenticateMobileAccessToken } from "@/lib/mobile-api/supabase";
import { todayInCordoba } from "@/lib/phase2/cordoba-date";
import { requestPerformanceContext } from "@/lib/request-performance";

export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
}

export async function GET(request: NextRequest) {
  const result = await handleMobileAuthenticatedRequest(request.headers.get("authorization"), {
    authenticate: authenticateMobileAccessToken,
    read: async context => {
      const from = parseNutritionDate(request.nextUrl.searchParams.get("from"));
      const to = parseNutritionDate(request.nextUrl.searchParams.get("to"));
      if (from > to || to > todayInCordoba() || to > shiftHistoryDate(from, 6)) {
        throw new MobileApiValidationError("Elegí hasta 7 días, desde la fecha más antigua y hasta hoy.");
      }
      const performance = requestPerformanceContext(request.headers);
      const days: Awaited<ReturnType<typeof readMobileNutritionDay>>[] = [];
      for (let date = from; date <= to; date = shiftHistoryDate(date, 1)) {
        days.push(await readMobileNutritionDay(date, context, performance));
      }
      return { from, to, days };
    },
  });
  return NextResponse.json(result.body, { status: result.status, headers: mobileApiResponseHeaders(request) });
}
