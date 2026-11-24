import { NextResponse, type NextRequest } from "next/server";

import {
  handleMobileAuthenticatedResourceRequest,
  handleMobileMutationRequest,
} from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders, readMobileJson } from "@/lib/mobile-api/http";
import {
  authenticateMobileAccessToken,
  authenticateMobileMutationAccessToken,
} from "@/lib/mobile-api/supabase";
import {
  readMobileTrainingRoutineDetail,
  setMobileTrainingRoutineStatus,
} from "@/lib/mobile-api/training-server";
import {
  measurePerformance,
  requestPerformanceContext,
} from "@/lib/request-performance";

export const dynamic = "force-dynamic";

type RoutineRouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: mobileApiResponseHeaders(request),
  });
}

export async function GET(request: NextRequest, route: RoutineRouteContext) {
  const { id } = await route.params;
  const requestPerformance = requestPerformanceContext(request.headers);
  const performanceBase = {
    route: "/api/mobile/v1/training/routines/[id]",
    ...requestPerformance,
  };
  const result = await handleMobileAuthenticatedResourceRequest(
    request.headers.get("authorization"),
    {
      authenticate: (accessToken) =>
        measurePerformance(
          { ...performanceBase, operation: "mobile.training.auth", layer: "auth" },
          () => authenticateMobileAccessToken(accessToken),
        ),
      read: (context) =>
        measurePerformance(
          { ...performanceBase, operation: "mobile.training.routine.detail", layer: "database" },
          () => readMobileTrainingRoutineDetail(id, context, request.nextUrl.searchParams.get("setKinds") === "1"),
        ),
    },
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: mobileApiResponseHeaders(request),
  });
}

export async function PATCH(request: NextRequest, route: RoutineRouteContext) {
  const { id } = await route.params;
  const requestPerformance = requestPerformanceContext(request.headers);
  const performanceBase = {
    route: "/api/mobile/v1/training/routines/[id]",
    ...requestPerformance,
  };
  const result = await handleMobileMutationRequest(
    request.headers.get("authorization"),
    {
      authenticate: (accessToken) =>
        measurePerformance(
          { ...performanceBase, operation: "mobile.training.auth", layer: "auth" },
          () => authenticateMobileMutationAccessToken(accessToken),
        ),
      mutate: (context) =>
        measurePerformance(
          { ...performanceBase, operation: "mobile.training.routine.status", layer: "database" },
          async () =>
            setMobileTrainingRoutineStatus(
              id,
              await readMobileJson(request),
              context,
              requestPerformance,
            ),
        ),
    },
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: mobileApiResponseHeaders(request),
  });
}
