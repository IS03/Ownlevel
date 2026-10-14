import { NextResponse, type NextRequest } from 'next/server';
import { MobileApiValidationError } from '@/lib/mobile-api/auth';
import { mobileApiResponseHeaders } from '@/lib/mobile-api/http';
import { sessionReadResponse } from '@/lib/mobile-api/training-session-route';
import { readMobileSessionHighlights } from '@/lib/mobile-api/training-session-highlights-server';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ sessionId: string }> };
export const OPTIONS = (request: NextRequest) => new NextResponse(null, { status: 204, headers: mobileApiResponseHeaders(request) });
export async function GET(request: NextRequest, { params }: Context) {
  return sessionReadResponse(request, '/api/mobile/v1/training/sessions/[sessionId]/highlights', async (context, performance) => {
    if ([...request.nextUrl.searchParams].length) throw new MobileApiValidationError('Parámetro no válido.');
    return readMobileSessionHighlights((await params).sessionId, context, performance);
  });
}
