import { NextResponse, type NextRequest } from 'next/server';
import {
  anonymousSessionCookie,
  createAnonymousSession,
  verifyAnonymousSession,
} from '@/lib/request-security';

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const current = request.cookies.get(anonymousSessionCookie.name)?.value;
  if (!verifyAnonymousSession(current)) {
    response.cookies.set({
      name: anonymousSessionCookie.name,
      value: createAnonymousSession(),
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: anonymousSessionCookie.maxAge,
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
