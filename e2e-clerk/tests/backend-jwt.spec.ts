import { test, expect } from '@playwright/test'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, loginWithPassword, getAccessToken } from './fixtures'

// Backend contract: Clerk session JWTs verified via PyJWKClient against
// CLERK_ISSUER, azp checked against CLERK_AUTHORIZED_PARTIES
// (backend/app/core/auth.py). This is the same contract
// backend/tests/test_auth.py exercises at the unit level with synthetic
// tokens; here it's a real token from a real browser session hitting the
// real deployed backend.
test.describe('backend JWT verification (Clerk)', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set (see e2e-clerk/.env.example)')

  test('a real Clerk session token is accepted by GET /api/me', async ({ page }) => {
    await loginWithPassword(page, TEST_USER_EMAIL, TEST_USER_PASSWORD)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.email).toBe(TEST_USER_EMAIL)
    expect(typeof body.user_id === 'string' || typeof body.id === 'string').toBe(true)
  })

  test('no Authorization header is rejected with 401', async ({ page }) => {
    const res = await page.request.get('/api/me')
    expect(res.status()).toBe(401)
  })

  test('a garbage bearer token is rejected with 401, not 500', async ({ page }) => {
    const res = await page.request.get('/api/me', {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    })
    expect(res.status()).toBe(401)
  })
})
