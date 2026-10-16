import { NextResponse } from "next/server";
import { MobileApiValidationError } from "@/lib/mobile-api/auth";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";
import { progressReadResponse } from "@/lib/mobile-api/progress-server";
import { buildMobileProgressStages } from "@/lib/mobile-api/progress-stages";
import { parseProgressStages } from "@/lib/mobile-api/progress-stages-contract";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => progressReadResponse(request, "stages", (context, params, today) => {
  if ([...params.keys()].length) throw new MobileApiValidationError("Parámetro no válido.");
  return buildMobileProgressStages(context, today);
}, parseProgressStages);
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
