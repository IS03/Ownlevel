import { NextResponse } from 'next/server';
import { mobileApiResponseHeaders } from '@/lib/mobile-api/http';
import { mealMomentBandsGetResponse, mealMomentBandsPutResponse } from '@/lib/mobile-api/nutrition-moment-bands-server';
export const dynamic = 'force-dynamic';
/** The caller's meal moment bands: when a meal loaded now is suggested as breakfast, lunch, snack or dinner. */
export function GET(request: Request) { return mealMomentBandsGetResponse(request); }
export function PUT(request: Request) { return mealMomentBandsPutResponse(request); }
export function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) }); }
