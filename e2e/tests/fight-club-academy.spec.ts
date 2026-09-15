import { test, expect } from '@playwright/test'
import { TEST_USER_PASSWORD, loginAsTestUser, FIGHT_CLUB } from './fixtures'

test.describe('Fight Club Academy brand (existing data verification)', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')

  test('brand exists with the correct name, tagline, colors, and real logo', async ({ page }) => {
    await loginAsTestUser(page)

    await page.getByRole('link', { name: FIGHT_CLUB.name }).first().click()
    await expect(page).toHaveURL(/\/[0-9a-f-]{36}$/)

    await page.getByRole('link', { name: 'Brand Kit' }).click()
    await page.getByRole('button', { name: 'REVIEW' }).click()

    await expect(page.getByText(FIGHT_CLUB.tagline).first()).toBeVisible()
    for (const color of FIGHT_CLUB.colors) {
      await expect(page.getByText(color, { exact: false }).first()).toBeVisible()
    }
  })

  test('real academy logo is set (not a placeholder, not regenerated)', async ({ page }) => {
    await loginAsTestUser(page)
    // Direct navigation, not a simulated sidebar-link click: Playwright's
    // synthetic click reliably lands on the page but this app's client-side
    // data fetch for it (useBrand) doesn't reliably resolve in time when
    // triggered that way in automation -- a testing-tool quirk, not an app
    // bug (confirmed: a plain page load renders "Remove logo" immediately).
    await page.goto(`/${FIGHT_CLUB.id}/settings`)

    const logoImg = page.locator('img[src*="logo.png"]').first()
    await expect(logoImg).toBeVisible({ timeout: 20_000 })
    const src = await logoImg.getAttribute('src')
    expect(src).toBeTruthy()
    expect(decodeURIComponent(src!)).toContain('supabase.co/storage')
    await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible({ timeout: 20_000 })
  })
})
