import { test, expect } from '@playwright/test'
import { TEST_USER_PASSWORD, loginAsTestUser, FIGHT_CLUB } from './fixtures'

test.describe('provider keys UI (no key values ever asserted or logged)', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')

  test('OpenAI key shows masked and Active; raw value never appears in the page', async ({ page }) => {
    await loginAsTestUser(page)
    // Direct navigation rather than a simulated sidebar-link click -- see
    // fight-club-academy.spec.ts for why (Playwright's synthetic click
    // doesn't reliably trigger this app's client-side data fetch in time).
    await page.goto(`/${FIGHT_CLUB.id}/keys`)
    await page.waitForLoadState('networkidle')

    // "OpenAI (1)" / "Gemini (1)" are plain buttons, not ARIA tabs; OpenAI
    // is the default-selected one, so no click is needed to see its key.
    await expect(page.getByText('Active').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/^••••/).first()).toBeVisible()

    // The masked display must never contain a plausible full OpenAI key
    // shape (sk-... 20+ chars) anywhere in the rendered DOM.
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
  })

  test('no provider key value appears in any loaded JS bundle', async ({ page }) => {
    const jsBodies: string[] = []
    page.on('response', async (res) => {
      if (res.url().endsWith('.js') && res.ok()) {
        try {
          jsBodies.push(await res.text())
        } catch {
          /* ignore */
        }
      }
    })

    await loginAsTestUser(page)
    await page.goto(`/${FIGHT_CLUB.id}/keys`)
    await page.waitForLoadState('networkidle')

    for (const body of jsBodies) {
      expect(body).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
      expect(body).not.toContain('sb_secret_')
    }
  })
})
