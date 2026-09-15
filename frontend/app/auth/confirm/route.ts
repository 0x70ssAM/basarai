import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// request.nextUrl's origin is not trustworthy here: running behind Render's
// proxy, the standalone Next.js server (started with HOSTNAME=0.0.0.0,
// PORT=3000 -- the Docker bind address, not a public host) can resolve its
// own perceived request origin to http://0.0.0.0:3000 instead of the real
// public domain, producing an invalid redirect Location. Build redirects
// from the explicit canonical site URL instead of the request-derived one.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as
    | 'signup'
    | 'invite'
    | 'magiclink'
    | 'recovery'
    | 'email_change'
    | 'email'
    | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      return NextResponse.redirect(new URL('/brands', SITE_URL))
    }
  }

  // If verification fails or params missing, redirect to login
  return NextResponse.redirect(new URL('/login', SITE_URL))
}
