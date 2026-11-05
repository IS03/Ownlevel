import { NextResponse } from "next/server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { performanceInsightsResponse } from "@/lib/mobile-api/performance-insights-server";

export const dynamic = "force-dynamic";
export const GET = performanceInsightsResponse;
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
