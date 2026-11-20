import { NextResponse } from 'next/server';
import { mobileApiResponseHeaders } from '@/lib/mobile-api/http';
import { progressTrainingRecoveryResponse } from '@/lib/mobile-api/progress-training-recovery-server';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => progressTrainingRecoveryResponse(request);
export const OPTIONS = (request: Request) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
