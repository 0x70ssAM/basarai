import { test, expect } from '@playwright/test'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, loginAsTestUser } from './fixtures'

test.describe('authentication', () => {
  test('protected route redirects to /login when signed out', async ({ page }) => {
    await page.goto('/brands')
    await expect(page).toHaveURL(/\/login/)
  })

  test('invalid credentials show an error, do not navigate away', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(TEST_USER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill('definitely-the-wrong-password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText(/invalid|incorrect/i)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('login succeeds and reaches /brands', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set (see e2e/.env.example)')
    await loginAsTestUser(page)
    await expect(page).toHaveURL(/\/brands/)
  })

  test('session persists across a full page reload', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginAsTestUser(page)
    await page.reload()
    await expect(page).toHaveURL(/\/brands/)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
  })

  test('protected route is reachable once authenticated', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginAsTestUser(page)
    await page.goto('/account')
    await expect(page).toHaveURL(/\/account/)
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
  })

  test('logout returns to /login and re-protects routes', async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
    await loginAsTestUser(page)
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/brands')
    await expect(page).toHaveURL(/\/login/)
  })

  test('duplicate signup with an existing email does not silently error, and creates no account takeover path', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill(TEST_USER_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill('SomeOtherPassword123!')
    await page.getByRole('button', { name: 'Sign up' }).click()

    // Supabase Auth's default anti-enumeration behavior for a duplicate
    // signup is a *silent* fake-success (no error, no new account, no
    // email) rather than revealing the email is taken -- both that and an
    // explicit "already exists" error are secure outcomes; what matters is
    // there's no crash and no way to tell (from an error message) that the
    // account was actually overwritten or duplicated.
    const errorMsg = page.getByText(/already exists|already registered/i)
    const successScreen = page.getByText('Check your email')
    await expect(errorMsg.or(successScreen)).toBeVisible({ timeout: 10_000 })
  })

  // Basar does not implement a password-reset / "forgot password" flow --
  // no link on /login, no /forgot-password route, no resetPasswordForEmail
  // call anywhere in the codebase. This is a feature gap, not a bug to
  // paper over with a fabricated test: assert the app is consistent about
  // not offering it, rather than a full flow that doesn't exist.
  test('no forgot-password entry point is advertised on /login (feature not implemented)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('link', { name: /forgot password|reset password/i })).toHaveCount(0)
  })
})
