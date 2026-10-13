import { NextResponse, type NextRequest } from "next/server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { sessionReadResponse, sessionMutationResponse } from "@/lib/mobile-api/training-session-route";
import { readMobileSessionExercise, saveMobileSessionExercise, removeMobileSessionExercise } from "@/lib/mobile-api/training-session-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ sessionId: string; sessionExerciseId: string }> };
const route = "/api/mobile/v1/training/sessions/[sessionId]/exercises/[sessionExerciseId]";
export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
}
export async function GET(request: NextRequest, { params }: Context) {
  const { sessionId, sessionExerciseId } = await params;
  return sessionReadResponse(request, route, (context) => readMobileSessionExercise(sessionId, sessionExerciseId, context, request.nextUrl.searchParams.get("routineAdditions") === "1"));
}
export async function PUT(request: NextRequest, { params }: Context) {
  const { sessionId, sessionExerciseId } = await params;
  return sessionMutationResponse(request, route, 200, (body, context) => saveMobileSessionExercise(sessionId, sessionExerciseId, body, context, request.nextUrl.searchParams.get("routineAdditions") === "1"));
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const { sessionId, sessionExerciseId } = await params;
  return sessionMutationResponse(request, route, 200, (body, context) => removeMobileSessionExercise(sessionId, sessionExerciseId, body, context));
}
