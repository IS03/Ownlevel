import { NextResponse, type NextRequest } from "next/server";
import { handleMobileMutationRequest } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders, readMobileJson } from "@/lib/mobile-api/http";
import { dismissMobileProgressInsight } from "@/lib/mobile-api/progress-insight";
import { authenticateMobileMutationAccessToken } from "@/lib/mobile-api/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });

/** "No me interesa": idempotent (dismissing twice is the same as once). */
export async function POST(request: NextRequest) {
  const result = await handleMobileMutationRequest(request.headers.get("authorization"), {
    authenticate: authenticateMobileMutationAccessToken,
    mutate: async (context) => dismissMobileProgressInsight(await readMobileJson(request), context),
  });
  return NextResponse.json(result.body, { status: result.status, headers: mobileApiResponseHeaders(request) });
}
