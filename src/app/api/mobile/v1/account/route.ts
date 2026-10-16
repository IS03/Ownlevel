import { NextResponse } from "next/server";
import { accountDeletionResponse } from "@/lib/mobile-api/account-deletion-server";
import { mobileApiResponseHeaders } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const DELETE = (request: Request) => accountDeletionResponse(request);
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
