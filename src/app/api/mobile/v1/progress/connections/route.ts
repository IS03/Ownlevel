import { NextResponse } from "next/server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { progressConnectionsResponse } from "@/lib/mobile-api/progress-server";

export const dynamic = "force-dynamic";
export const GET = progressConnectionsResponse;
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
