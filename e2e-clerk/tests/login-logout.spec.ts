import { test, expect } from '@playwright/test'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, loginWithPassword, openMobileMenuIfNeeded } from './fixtures'

const BASE_URL = process.env.BASE_URL ?? 'https://basarai-clerk-staging.onrender.com'

test.describe('Clerk password login/logout', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set (see e2e-clerk/.env.example)')

  test('password login lands on /brands on the real staging origin', async ({ page }) => {
    await loginWithPassword(page, TEST_USER_EMAIL, TEST_USER_PASSWORD)
    expect(new URL(page.url()).origin).toBe(BASE_URL)
    expect(page.url()).toContain('/brands')
  })

  test('wrong password shows an inline error, no navigation', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(TEST_USER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password')
    await page.getByRole('button', { name: 'Log in' }).click()
    // The destructive-styled error banner in login/page.tsx -- a generic
    // "any text visible" locator is fragile (it can resolve to the
    // desktop-only hero heading, which is legitimately CSS-hidden on
    // mobile, producing a false failure unrelated to whether the actual
    // error rendered).
    await expect(page.locator('.text-destructive').first()).toBeVisible()
    expect(page.url()).toContain('/login')
  })

  test('visiting /login while signed in redirects to /brands', async ({ page }) => {
    await loginWithPassword(page, TEST_USER_EMAIL, TEST_USER_PASSWORD)
    await page.goto('/login')
    await page.waitForURL('**/brands')
  })

  test('logout via the sidebar returns to /login and re-protects /brands', async ({ page }) => {
    await loginWithPassword(page, TEST_USER_EMAIL, TEST_USER_PASSWORD)
    await openMobileMenuIfNeeded(page)
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL('**/login')

    const res = await page.request.get('/brands', { maxRedirects: 0 })
    expect([301, 302, 303, 307, 308]).toContain(res.status())
  })
})
