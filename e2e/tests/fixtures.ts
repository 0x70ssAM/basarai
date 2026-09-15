import type { Page } from '@playwright/test'

export const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'test@fightclub.local'
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? ''

export const FIGHT_CLUB = {
  id: '2f692b61-89a0-467a-b8c9-2155479cac31',
  name: 'Fight Club Academy',
  tagline: 'Train hard. Fight smart.',
  colors: ['#F08335', '#DC311F', '#0F407D'],
}

/** Logs in via the real UI form (no auth bypass) and waits for /brands. */
export async function loginAsTestUser(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(TEST_USER_EMAIL)
  // exact: true -- otherwise this also matches the "Show password" toggle
  // button, whose aria-label contains the substring "password".
  await page.getByLabel('Password', { exact: true }).fill(TEST_USER_PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL('**/brands')
}

/**
 * Reads the access token out of the Supabase SSR auth cookie. The app's
 * own frontend/lib/api.ts sends this as an `Authorization: Bearer` header
 * on every FastAPI call -- middleware's cookie-based session check alone
 * does not grant access to /api/*, so a test that skips this header is
 * testing a request shape the real app never actually sends.
 */
export async function getAccessToken(page: Page): Promise<string> {
  const cookies = await page.context().cookies()
  const authCookie = cookies.find((c) => /^sb-.*-auth-token$/.test(c.name))
  if (!authCookie) throw new Error('no Supabase auth cookie found -- log in first')
  const raw = decodeURIComponent(authCookie.value).replace(/^base64-/, '')
  const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
  if (!decoded.access_token) throw new Error('auth cookie had no access_token')
  return decoded.access_token as string
}

/**
 * Calls Supabase's Admin API to deterministically generate a signup
 * confirmation link, without needing a real inbox. Used only to inspect
 * the encoded redirect (never prints the secret key or the token).
 */
export async function generateSignupConfirmationLink(email: string, password: string) {
  const supabaseUrl = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY must be set (see e2e/.env.example)')
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'signup',
      email,
      password,
      options: { redirect_to: `${process.env.BASE_URL ?? 'https://basarai-staging.onrender.com'}/auth/confirm` },
    }),
  })
  if (!res.ok) {
    throw new Error(`generate_link failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  const actionLink: string = body.properties?.action_link ?? body.action_link
  if (!actionLink) throw new Error('generate_link response had no action_link')
  return actionLink
}

/**
 * Logs a page in as an EXISTING user via a generated magic link, without
 * ever touching or needing that user's password. Used only to test backend
 * admin authorization against the real configured admin account
 * (ADMIN_TEST_EMAIL) as that real account, which we don't and shouldn't
 * have the password for. Establishes a real cookie session (required --
 * middleware redirects any request without a valid session cookie before
 * it ever reaches the backend, regardless of an Authorization header).
 */
export async function loginAsExistingUserViaMagicLink(page: Page, email: string) {
  const supabaseUrl = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY must be set (see e2e/.env.example)')
  }
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  })
  if (!res.ok) {
    throw new Error(`generate_link (magiclink) failed: ${res.status} ${await res.text()}`)
  }
  const body = await res.json()
  const actionLink: string = body.properties?.action_link ?? body.action_link
  if (!actionLink) throw new Error('generate_link response had no action_link')

  await page.goto(actionLink)
  await page.waitForLoadState('networkidle')
}

/** Deletes a test user by email via the Admin API, for cleanup. */
export async function deleteTestUser(userId: string) {
  const supabaseUrl = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) return
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
  })
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !secretKey) return null
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` } }
  )
  if (!res.ok) return null
  const body = await res.json()
  const users = body.users ?? body
  return Array.isArray(users) && users.length > 0 ? users[0].id : null
}
