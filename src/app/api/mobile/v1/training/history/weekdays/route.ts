import { NextResponse, type NextRequest } from "next/server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { sessionReadResponse } from "@/lib/mobile-api/training-session-route";
import { readMobileTrainingWeekdaySessions } from "@/lib/mobile-api/training-session-server";

export const dynamic = "force-dynamic";
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
}
export async function GET(request: NextRequest) {
  return sessionReadResponse(request, "/api/mobile/v1/training/history/weekdays",
    (context, performance) => readMobileTrainingWeekdaySessions(request.nextUrl.searchParams, context, performance));
}
