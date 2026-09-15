import { test, expect } from '@playwright/test'
import { TEST_USER_PASSWORD, loginAsTestUser, getAccessToken } from './fixtures'

test.describe('FastAPI endpoints (through the Next.js /api proxy)', () => {
  test('unauthenticated request is rejected, not given data', async ({ request }) => {
    // Playwright's request context follows redirects by default, so a
    // naive status check would see the *final* /login page's 200, not the
    // original redirect. Disable that to see the real first response.
    const res = await request.get('/api/me', { maxRedirects: 0 })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
    expect(res.headers()['location']).toContain('/login')
  })

  test('malformed request body is handled gracefully, not a 500', async ({ request }) => {
    const res = await request.post('/api/brands', {
      data: { not_a_valid_field: 123 },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
    expect(res.status()).toBeLessThan(500)
  })

  test('authenticated request succeeds with a real session token', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginAsTestUser(page)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/me', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.email).toBeTruthy()
  })

  test('authenticated brands list returns the Fight Club Academy brand', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginAsTestUser(page)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/brands', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const names = (Array.isArray(body) ? body : body.brands ?? []).map((b: { name: string }) => b.name)
    expect(names).toContain('Fight Club Academy')
  })
})
