import { NextResponse, type NextRequest } from "next/server";

import { handleMobileMutationRequest } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders, readMobileJson } from "@/lib/mobile-api/http";
import { authenticateMobileMutationAccessToken } from "@/lib/mobile-api/supabase";
import { reorderMobileTrainingRoutines } from "@/lib/mobile-api/training-server";
import { measurePerformance, requestPerformanceContext } from "@/lib/request-performance";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
}

export async function PUT(request: NextRequest) {
  const requestPerformance = requestPerformanceContext(request.headers);
  const performanceBase = {
    route: "/api/mobile/v1/training/routines/order",
    ...requestPerformance,
  };
  const result = await handleMobileMutationRequest(
    request.headers.get("authorization"),
    {
      authenticate: (accessToken) => measurePerformance(
        { ...performanceBase, operation: "mobile.training.auth", layer: "auth" },
        () => authenticateMobileMutationAccessToken(accessToken),
      ),
      mutate: (context) => measurePerformance(
        { ...performanceBase, operation: "mobile.training.routines.order", layer: "database" },
        async () => reorderMobileTrainingRoutines(
          await readMobileJson(request),
          context,
        ),
      ),
    },
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: mobileApiResponseHeaders(request),
  });
}
