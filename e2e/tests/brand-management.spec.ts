import { test, expect } from '@playwright/test'
import { TEST_USER_PASSWORD, loginAsTestUser } from './fixtures'

// Uses a disposable, uniquely-named test brand -- never touches the real
// Fight Club Academy brand (covered separately in fight-club-academy.spec.ts).
test.describe('brand management (CRUD)', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')

  const brandName = `E2E Test Brand ${Date.now()}`

  test('create, edit, persist, and delete a brand', async ({ page }) => {
    await loginAsTestUser(page)

    // Create
    await page.getByRole('button', { name: 'Create brand' }).first().click()
    await page.getByLabel('Brand name').fill(brandName)
    await page.getByRole('button', { name: 'Create' }).click()
    // Sidebar workspace switcher gets the new brand link; that's the signal
    // the create succeeded and we've navigated into it (no page <h1> shows
    // the brand name -- the main heading here reads "Generate").
    const sidebarNav = page.locator('nav')
    const kitLink = sidebarNav.getByRole('link', { name: 'Brand Kit' })
    await expect(kitLink).toBeVisible({ timeout: 15_000 })
    // Read the id from the link's own href, not page.url() -- the URL bar
    // update from client-side routing can lag the DOM, and reading it too
    // early here previously produced the literal string "brands" (from a
    // stale /brands URL), routing every later step at /brands/settings
    // instead of a real brand and crashing server-side.
    const kitHref = (await kitLink.getAttribute('href')) ?? ''
    const brandId = kitHref.split('/')[1]
    expect(brandId).toMatch(/^[0-9a-f-]{36}$/)

    // Brand Kit: tagline + tone + audience + one color, then save
    await sidebarNav.getByRole('link', { name: 'Brand Kit' }).click()
    await page.getByRole('button', { name: 'TAGLINE' }).click()
    await page.getByLabel('Tagline').fill('E2E persistence check.')
    await page.getByRole('button', { name: 'TONE' }).click()
    await page.getByRole('button', { name: 'Professional' }).click()
    await page.getByRole('button', { name: 'AUDIENCE' }).click()
    await page.getByLabel('Audience').fill('Automated end-to-end test readers.')
    await page.getByRole('button', { name: 'COLORS' }).click()
    await page.getByRole('button', { name: 'Add color' }).click()
    await page.getByRole('button', { name: 'REVIEW' }).click()
    await page.getByRole('button', { name: 'Save brand kit' }).click()
    await expect(page.getByText('Brand kit saved')).toBeVisible({ timeout: 15_000 })

    // Persistence: reload and confirm the saved values survive. The
    // wizard's step state is local (useState(0)), so a reload always lands
    // back on the first step regardless of completion -- check the status
    // badge there, then jump to REVIEW to confirm the saved field values.
    await page.reload()
    await expect(page.getByText('COMPLETE').first()).toBeVisible()
    await page.getByRole('button', { name: 'REVIEW' }).click()
    await expect(page.getByText('E2E persistence check.').first()).toBeVisible()

    // Rename via Settings, confirm it persists. Direct navigation rather
    // than a simulated sidebar-link click -- see fight-club-academy.spec.ts
    // for why (this app's client-side data fetch for the destination page
    // doesn't reliably resolve in time when triggered by a synthetic click
    // in automation).
    await page.goto(`/${brandId}/settings`)
    const renamed = `${brandName} (renamed)`
    // Settings' "Brand name" is a CardTitle (styled <div>, see
    // fight-club-academy.spec.ts's earlier note on this pattern), not a
    // <label>, so getByLabel can't associate it with the input -- it's the
    // only textbox on the page, so target it directly.
    const nameInput = page.getByRole('textbox').first()
    await nameInput.fill(renamed)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Name updated')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('textbox').first()).toHaveValue(renamed)

    // Cleanup: delete the disposable test brand. This is a custom React
    // dialog (not a native confirm()) that requires typing the exact brand
    // name before its own "Delete brand" button enables.
    await page.getByRole('button', { name: 'Delete brand' }).click()
    await page.getByPlaceholder('Type brand name to confirm').fill(renamed)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete brand' }).click()
    await expect(page).toHaveURL(/\/brands$/, { timeout: 15_000 })
    await expect(page.getByText(renamed)).toHaveCount(0)
  })
})
