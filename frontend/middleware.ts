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

const withClerk = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth()
  if (userId && isAuthPage(req)) return NextResponse.redirect(new URL('/brands', req.url))
  if (!isPublic(req)) await auth.protect()
})

export default async function middleware(
  req: Parameters<typeof withClerk>[0],
  event: Parameters<typeof withClerk>[1],
) {
  try {
    // A malformed-but-JWT-shaped Authorization header makes clerkMiddleware
    // itself throw -- before our handler callback above ever runs -- so a
    // try/catch inside that callback cannot see it (confirmed live: that
    // approach did not stop the 500). Wrapping the whole exported function
    // is the only place that can actually catch it.
    return await withClerk(req, event)
  } catch (err) {
    if (isNextControlFlowSignal(err)) throw err
    if (!isPublic(req)) return NextResponse.redirect(new URL('/login', req.url))
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
