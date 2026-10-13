import { NextResponse, type NextRequest } from "next/server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { sessionReadResponse, sessionMutationResponse } from "@/lib/mobile-api/training-session-route";
import { readMobileSession, cancelMobileSession } from "@/lib/mobile-api/training-session-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ sessionId: string }> };
const route = "/api/mobile/v1/training/sessions/[sessionId]";
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
}
export async function GET(request: NextRequest, { params }: Context) {
  const { sessionId } = await params;
  return sessionReadResponse(request, route, (context, performance) => readMobileSession(sessionId, context, performance, request.nextUrl.searchParams.get("routineAdditions") === "1"));
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const { sessionId } = await params;
  return sessionMutationResponse(request, route, 200, (body, context) => cancelMobileSession(sessionId, body, context));
}
