import { test, expect } from '@playwright/test'
import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD, TEST_USER_EMAIL, TEST_USER_PASSWORD, loginWithPassword, getAccessToken } from './fixtures'

// Backend is the source of truth for admin authorization
// (backend/app/core/auth.py: get_current_admin_user, gated by the
// ADMIN_EMAILS allow-list). The frontend /admin layout only hides the
// UI; it re-checks the same backend /me response.
test.describe('admin authorization (Clerk)', () => {
  test('non-admin user is rejected from an admin endpoint (403)', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginWithPassword(page, TEST_USER_EMAIL, TEST_USER_PASSWORD)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })

  test('the configured admin account is granted access (200)', async ({ page }) => {
    test.skip(!ADMIN_TEST_EMAIL || !ADMIN_TEST_PASSWORD, 'ADMIN_TEST_EMAIL/PASSWORD not set (see e2e-clerk/.env.example)')
    await loginWithPassword(page, ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.total_accounts).toBeGreaterThanOrEqual(0)
  })
})
