import { NextResponse, type NextRequest } from "next/server";
import { handleMobileMutationRequest } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders, readMobileJson } from "@/lib/mobile-api/http";
import { deleteMobileProgressView, renameMobileProgressView } from "@/lib/mobile-api/progress-views-server";
import { authenticateMobileMutationAccessToken } from "@/lib/mobile-api/supabase";

export const dynamic = "force-dynamic";
type ViewRouteContext = { params: Promise<{ id: string }> };
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });

export async function PATCH(request: NextRequest, route: ViewRouteContext) {
  const { id } = await route.params;
  const result = await handleMobileMutationRequest(request.headers.get("authorization"), {
    authenticate: authenticateMobileMutationAccessToken,
    mutate: async (context) => renameMobileProgressView(id, await readMobileJson(request), context),
  });
  return NextResponse.json(result.body, { status: result.status, headers: mobileApiResponseHeaders(request) });
}

export async function DELETE(request: NextRequest, route: ViewRouteContext) {
  const { id } = await route.params;
  const expectedVersion = new URL(request.url).searchParams.get("expectedVersion");
  const result = await handleMobileMutationRequest(request.headers.get("authorization"), {
    authenticate: authenticateMobileMutationAccessToken,
    mutate: (context) => deleteMobileProgressView(id, expectedVersion, context),
  });
  return NextResponse.json(result.body, { status: result.status, headers: mobileApiResponseHeaders(request) });
}
