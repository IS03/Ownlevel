import { NextResponse, type NextRequest } from "next/server";
import { handleMobileMutationRequest } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders, readMobileJson } from "@/lib/mobile-api/http";
import { progressViewsResponse } from "@/lib/mobile-api/progress-server";
import { createMobileProgressView } from "@/lib/mobile-api/progress-views-server";
import { authenticateMobileMutationAccessToken } from "@/lib/mobile-api/supabase";

export const dynamic = "force-dynamic";
export const GET = progressViewsResponse;
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });

export async function POST(request: NextRequest) {
  const result = await handleMobileMutationRequest(request.headers.get("authorization"), {
    authenticate: authenticateMobileMutationAccessToken,
    mutate: async (context) => createMobileProgressView(await readMobileJson(request), context),
    successStatus: 201,
  });
  return NextResponse.json(result.body, { status: result.status, headers: mobileApiResponseHeaders(request) });
}
