import { test, expect } from '@playwright/test'
import { TEST_USER_PASSWORD, loginAsTestUser, getAccessToken, loginAsExistingUserViaMagicLink } from './fixtures'

const ADMIN_TEST_EMAIL = process.env.ADMIN_TEST_EMAIL ?? ''

// Backend is the real source of truth for admin authorization
// (backend/app/core/auth.py: get_current_admin_user, gated by the
// ADMIN_EMAILS allow-list). The frontend /admin layout only hides the UI;
// it re-checks the same backend /me response, so there is no separate,
// weaker client-side authorization path to bypass.
test.describe('admin authorization', () => {
  test('non-admin user is rejected from an admin endpoint (403)', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginAsTestUser(page)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(403)
  })

  test('the configured admin account is granted access (200)', async ({ page }) => {
    test.skip(!ADMIN_TEST_EMAIL, 'ADMIN_TEST_EMAIL not set (see e2e/.env.example)')
    await loginAsExistingUserViaMagicLink(page, ADMIN_TEST_EMAIL)
    const token = await getAccessToken(page)

    const res = await page.request.get('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.total_accounts).toBeGreaterThanOrEqual(0)
  })
})
