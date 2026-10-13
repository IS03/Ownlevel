import { NextResponse, type NextRequest } from "next/server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { sessionMutationResponse } from "@/lib/mobile-api/training-session-route";
import { finishMobileSession } from "@/lib/mobile-api/training-session-server";

export const dynamic = "force-dynamic";
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return sessionMutationResponse(request, "/api/mobile/v1/training/sessions/[sessionId]/finish", 200,
    (body, context) => finishMobileSession(sessionId, body, context, request.nextUrl.searchParams.get("routineAdditions") === "1"));
}
