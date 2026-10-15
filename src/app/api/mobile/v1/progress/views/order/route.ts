import { NextResponse, type NextRequest } from "next/server";
import { handleMobileMutationRequest } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders, readMobileJson } from "@/lib/mobile-api/http";
import { reorderMobileProgressViews } from "@/lib/mobile-api/progress-views-server";
import { authenticateMobileMutationAccessToken } from "@/lib/mobile-api/supabase";

export const dynamic = "force-dynamic";
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });

export async function PUT(request: NextRequest) {
  const result = await handleMobileMutationRequest(request.headers.get("authorization"), {
    authenticate: authenticateMobileMutationAccessToken,
    mutate: async (context) => reorderMobileProgressViews(await readMobileJson(request), context),
  });
  return NextResponse.json(result.body, { status: result.status, headers: mobileApiResponseHeaders(request) });
}
