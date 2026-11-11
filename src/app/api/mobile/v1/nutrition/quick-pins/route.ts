import { NextResponse } from 'next/server';
import { mobileApiResponseHeaders } from '@/lib/mobile-api/http';
import { quickPinsPutResponse } from '@/lib/mobile-api/nutrition-quick-pins-server';
export const dynamic = 'force-dynamic';
/** #479: the ordered pinned saved meals of the caller (read through GET /nutrition/quick-options). */
export function PUT(request: Request) { return quickPinsPutResponse(request); }
export function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) }); }
