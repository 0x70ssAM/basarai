import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'https://basarai-clerk-staging.onrender.com'

// This suite exists because the previous production incident on
// basarai-staging (Supabase Auth) was exactly this failure mode: an
// auth redirect resolving to the container's internal bind address
// (http://0.0.0.0:3000) instead of the real public origin. Clerk's
// custom flows build their redirectUrl from window.location.origin in
// the browser (frontend/app/(auth)/login/page.tsx,
// frontend/app/(auth)/signup/page.tsx), which sidesteps the server-side
// class of bug entirely -- but middleware redirects (clerkMiddleware,
// NextResponse.redirect) still run server-side, so they're re-verified
// here the same way.
test.describe('auth redirects never leak the container bind address', () => {
  test('signed-out /brands redirects to /login on the real origin', async ({ request }) => {
    const res = await request.get('/brands', { maxRedirects: 0 })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
    const location = res.headers()['location'] ?? ''
    expect(location).not.toContain('0.0.0.0')
    expect(location).not.toMatch(/^http:\/\/localhost/)
  })

  test('signed-out root redirects to /login, not the bind address', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const finalUrl = page.url()
    expect(finalUrl).not.toContain('0.0.0.0')
    expect(finalUrl).not.toContain('127.0.0.1')
    expect(new URL(finalUrl).origin).toBe(BASE_URL)
    expect(finalUrl).toContain('/login')
  })
})
