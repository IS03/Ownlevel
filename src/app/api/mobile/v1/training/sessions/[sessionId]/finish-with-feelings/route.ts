import { NextResponse, type NextRequest } from "next/server";
import { MobileApiValidationError } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { sessionMutationResponse } from "@/lib/mobile-api/training-session-route";
import { writeTrainingFeelings } from "@/lib/mobile-api/training-feelings-server";

export const dynamic = "force-dynamic";
export function OPTIONS(request: NextRequest) { return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) }); }
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return sessionMutationResponse(request, "/api/mobile/v1/training/sessions/[sessionId]/finish-with-feelings", 200, (body, context) => {
    if (request.nextUrl.search) throw new MobileApiValidationError("Los parámetros no son válidos.");
    return writeTrainingFeelings(sessionId, body, "finish", context);
  });
}
