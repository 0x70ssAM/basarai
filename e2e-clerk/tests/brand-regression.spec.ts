import { test, expect } from '@playwright/test'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, loginWithPassword } from './fixtures'

// Confirms the auth swap didn't touch brand management: this is the
// same UI, same FastAPI routers, same Supabase-backed tables (on the
// new, isolated basarai-clerk-staging Supabase project) as before --
// only identity changed. No pre-existing brand/kit/keys fixture exists
// on this fresh database (unlike ../e2e, which reuses the seeded "Fight
// Club Academy" brand on basarai-staging), so this test creates and
// tears down its own brand.
test.describe('brand management regression (Clerk auth, untouched business logic)', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set (see e2e-clerk/.env.example)')

  const brandName = `E2E Clerk Brand ${Date.now()}`

  test('create a brand, see it listed, then delete it', async ({ page }) => {
    await loginWithPassword(page, TEST_USER_EMAIL, TEST_USER_PASSWORD)

    await page.goto('/brands')
    // Several elements share the accessible name "Create brand" (the
    // sidebar's icon-only "+" button, the page header button, and the
    // empty-state CTA) -- scope to the main content header button.
    await page.locator('main').getByRole('button', { name: 'Create brand', exact: true }).first().click()
    await page.getByLabel(/brand name/i).fill(brandName)
    await page.getByRole('button', { name: /^create$/i }).click()

    await expect(page.getByText(brandName).first()).toBeVisible({ timeout: 15_000 })

    // Navigate into the new brand's settings and delete it, restoring a
    // clean slate for the next run. Click the brand card link, not the
    // sidebar's copy of the same name.
    await page.getByRole('link', { name: new RegExp(brandName) }).first().click()
    await page.waitForURL(/\/[0-9a-f-]{36}/)
    await page.goto(page.url().replace(/\/[a-z0-9-]*$/, '') + '/settings')
    const deleteButton = page.getByRole('button', { name: /delete brand/i })
    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click()
      const confirmButton = page.getByRole('button', { name: /^delete$/i })
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click()
      }
    }
  })
})
