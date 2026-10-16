import { NextResponse } from 'next/server';
import { nutritionStagesResponse } from '@/lib/mobile-api/nutrition-stages-server';
import { mobileApiResponseHeaders } from '@/lib/mobile-api/http';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => nutritionStagesResponse(request);
export const POST = (request: Request) => nutritionStagesResponse(request);
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
