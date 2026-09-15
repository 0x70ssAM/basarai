import { test, expect } from '@playwright/test'
import {
  generateSignupConfirmationLink,
  findUserIdByEmail,
  deleteTestUser,
} from './fixtures'

const BASE_URL = process.env.BASE_URL ?? 'https://basarai-staging.onrender.com'

// REQUIRED acceptance test: two distinct production bugs, both in this
// same redirect chain, found and fixed across two rounds of validation:
//
// 1. The hosted Supabase project's Auth "Site URL" was still the default
//    http://localhost:3000 with an empty Redirect URL allow-list, so
//    GoTrue rejected the app's requested emailRedirectTo and fell back to
//    the wrong Site URL. Fixed via the Supabase Management API (site_url +
//    uri_allow_list) -- not app code.
//
// 2. app/auth/confirm/route.ts built its own redirect from
//    request.nextUrl.clone(). Behind Render's reverse proxy, the
//    standalone Next.js server (HOSTNAME=0.0.0.0, PORT=3000 -- a Docker
//    bind address, not a public host) resolved its own perceived request
//    origin to http://0.0.0.0:3000 instead of the real domain. Fixed by
//    building the redirect from an explicit NEXT_PUBLIC_SITE_URL instead.
test.describe('email confirmation redirect (production bug fix verification)', () => {
  const testEmail = `e2e-confirm-${Date.now()}@fightclub.local`
  const testPassword = 'TempTest12345!'

  test.afterAll(async () => {
    const userId = await findUserIdByEmail(testEmail)
    if (userId) await deleteTestUser(userId)
  })

  test('confirmation link is encoded with the production origin, not localhost or 0.0.0.0', async () => {
    const actionLink = await generateSignupConfirmationLink(testEmail, testPassword)
    const url = new URL(actionLink)
    const redirectTo = url.searchParams.get('redirect_to') ?? ''

    expect(redirectTo).not.toContain('localhost')
    expect(redirectTo).not.toContain('127.0.0.1')
    expect(redirectTo).not.toContain('0.0.0.0')
    expect(redirectTo).toContain('basarai-staging.onrender.com')
  })

  test('clicking the confirmation link lands the browser on the production URL, never 0.0.0.0', async ({ page }) => {
    const actionLink = await generateSignupConfirmationLink(testEmail, testPassword)

    await page.goto(actionLink)
    await page.waitForLoadState('networkidle')

    const finalUrl = page.url()
    expect(finalUrl, `final URL was: ${finalUrl}`).not.toContain('localhost')
    expect(finalUrl).not.toContain('127.0.0.1')
    expect(finalUrl).not.toContain('0.0.0.0')
    expect(new URL(finalUrl).origin).toBe(BASE_URL)
  })

  // Direct regression test for the exact root cause: hit the route that
  // used to leak request.nextUrl's bind-derived origin, with no dependency
  // on GoTrue/email generation at all -- this alone would have caught the
  // 0.0.0.0:3000 bug.
  test('/auth/confirm redirects using the real origin even for an invalid token', async ({ request }) => {
    const res = await request.get('/auth/confirm?token_hash=invalid-token&type=signup', {
      maxRedirects: 0,
    })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
    const location = res.headers()['location'] ?? ''
    expect(location).not.toContain('0.0.0.0')
    expect(location).not.toMatch(/^http:\/\/localhost/)
    // Same-origin relative redirects are fine; if absolute, it must be the
    // real deployed origin.
    if (location.startsWith('http')) {
      expect(new URL(location).origin).toBe(BASE_URL)
    }
  })
})
