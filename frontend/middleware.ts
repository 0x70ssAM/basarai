import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublic = createRouteMatcher(['/', '/login(.*)', '/signup(.*)', '/auth/(.*)'])
const isAuthPage = createRouteMatcher(['/login(.*)', '/signup(.*)'])

function isNextControlFlowSignal(err: unknown): boolean {
  // Next.js implements redirect()/notFound() by throwing a special error
  // with a `digest` Next's own runtime catches to perform the real
  // response -- must be allowed to propagate, not swallowed as a bug.
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (err as { digest: string }).digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'))
  )
}

export default clerkMiddleware(async (auth, req) => {
  try {
    const { userId } = await auth()
    if (userId && isAuthPage(req)) return NextResponse.redirect(new URL('/brands', req.url))
    if (!isPublic(req)) await auth.protect()
  } catch (err) {
    if (isNextControlFlowSignal(err)) throw err
    // A malformed-but-JWT-shaped Authorization header can make Clerk's own
    // auth() throw instead of resolving to "unauthenticated" (observed
    // live: a crafted 3-segment Bearer token returned a bare Next.js 500
    // instead of a clean redirect -- confirmed no stack trace/secret was
    // exposed, but the status/behavior was wrong). Treat any unexpected
    // auth-resolution failure the same as "not signed in".
    if (!isPublic(req)) return NextResponse.redirect(new URL('/login', req.url))
  }
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
