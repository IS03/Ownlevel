import { NextResponse } from 'next/server';
import { mobileApiResponseHeaders } from '@/lib/mobile-api/http';
import { progressTrainingTimesResponse } from '@/lib/mobile-api/progress-training-times-server';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => progressTrainingTimesResponse(request);
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
