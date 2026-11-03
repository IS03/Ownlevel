import { NextResponse, type NextRequest } from "next/server";
import { MobileApiValidationError } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { sessionMutationResponse, sessionReadResponse } from "@/lib/mobile-api/training-session-route";
import { readTrainingFeelings, writeTrainingFeelings } from "@/lib/mobile-api/training-feelings-server";

export const dynamic = "force-dynamic";
const route = "/api/mobile/v1/training/sessions/[sessionId]/feelings";
function query(request: NextRequest) {
  if (request.nextUrl.search) throw new MobileApiValidationError("Los parámetros no son válidos.");
}
export function OPTIONS(request: NextRequest) { return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) }); }
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return sessionReadResponse(request, route, context => { query(request); return readTrainingFeelings(sessionId, context); });
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return sessionMutationResponse(request, route, 200, (body, context) => { query(request); return writeTrainingFeelings(sessionId, body, "save", context); });
}
