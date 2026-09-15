import { test, expect } from '@playwright/test'
import {
  generateSignupConfirmationLink,
  findUserIdByEmail,
  deleteTestUser,
} from './fixtures'

// REQUIRED acceptance test (see task Phase 13): the reported production bug
// was the email confirmation link redirecting to localhost instead of the
// Render URL. Root cause was the hosted Supabase project's Auth "Site URL"
// still being the default http://localhost:3000 with an empty Redirect URL
// allow-list, so GoTrue rejected the app's requested emailRedirectTo and
// fell back to the (wrong) Site URL. Fixed via the Supabase Management API
// (site_url + uri_allow_list), not app code -- verified here end to end.
test.describe('email confirmation redirect (production bug fix verification)', () => {
  const testEmail = `e2e-confirm-${Date.now()}@fightclub.local`
  const testPassword = 'TempTest12345!'

  test.afterAll(async () => {
    const userId = await findUserIdByEmail(testEmail)
    if (userId) await deleteTestUser(userId)
  })

  test('confirmation link is encoded with the production origin, not localhost', async () => {
    const actionLink = await generateSignupConfirmationLink(testEmail, testPassword)
    const url = new URL(actionLink)
    const redirectTo = url.searchParams.get('redirect_to') ?? ''

    expect(redirectTo).not.toContain('localhost')
    expect(redirectTo).not.toContain('127.0.0.1')
    expect(redirectTo).toContain('basarai-staging.onrender.com')
  })

  test('clicking the confirmation link lands the browser on the production URL', async ({ page }) => {
    const actionLink = await generateSignupConfirmationLink(testEmail, testPassword)

    await page.goto(actionLink)
    await page.waitForLoadState('networkidle')

    const finalUrl = page.url()
    expect(finalUrl, `final URL was: ${finalUrl}`).not.toContain('localhost')
    expect(finalUrl).not.toContain('127.0.0.1')
    expect(new URL(finalUrl).origin).toBe('https://basarai-staging.onrender.com')
  })
})
