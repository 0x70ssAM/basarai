import type { Page } from '@playwright/test'

export const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'e2e-clerk-test@example.com'
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? ''
export const ADMIN_TEST_EMAIL = process.env.ADMIN_TEST_EMAIL ?? ''
export const ADMIN_TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD ?? ''

/** Logs in via the real UI password form (no auth bypass) and waits for /brands. */
export async function loginWithPassword(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('**/brands')
}

/**
 * Reads a live Clerk session token straight from the client SDK, exactly
 * the way frontend/lib/api.ts does it (window.Clerk.session.getToken()).
 * There is no cookie to parse for Clerk the way there was for the
 * Supabase SSR cookie in ../e2e/tests/fixtures.ts -- Clerk's session
 * cookie is opaque and not meant to be decoded client-side.
 */
export async function getAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerk = (window as any).Clerk
    if (!clerk?.session) return null
    return clerk.session.getToken()
  })
  if (!token) throw new Error('no Clerk session token -- log in first')
  return token as string
}
