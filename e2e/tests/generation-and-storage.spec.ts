import { test, expect } from '@playwright/test'
import { TEST_USER_PASSWORD, loginAsTestUser, FIGHT_CLUB } from './fixtures'

const RUN = (process.env.RUN_GENERATION_TEST ?? 'true') !== 'false'

// Real OpenAI calls cost money -- exactly ONE generation for the whole
// suite, then every other assertion (storage, history, download, detail
// page) reuses that same result instead of generating more images.
test.describe.serial('image generation, storage, and history (single real OpenAI call)', () => {
  test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')
  test.skip(!RUN, 'RUN_GENERATION_TEST=false')
  test.setTimeout(120_000)

  let historyDetailUrl = ''
  let imageUrl = ''

  test('Facebook Post generation with OpenAI + logo watermark succeeds', async ({ page }) => {
    await loginAsTestUser(page)
    await page.getByRole('link', { name: FIGHT_CLUB.name }).first().click()

    await page.getByRole('radio', { name: /Post.*Facebook/i }).check()
    const openaiRadio = page.getByRole('radio', { name: 'OpenAI' })
    await openaiRadio.check()
    await expect(openaiRadio).toBeChecked() // guard against silently generating with Gemini instead
    await page.getByRole('radio', { name: 'Mark' }).check()
    await page
      .getByPlaceholder('Describe the image…')
      .fill(
        'Create a professional Facebook campaign poster for Fight Club Academy promoting 50% off all training programs for a Back to School campaign. Energetic, premium, disciplined, authentic.'
      )

    await page.getByRole('button', { name: 'Generate' }).click()

    // Poll History for a terminal status rather than the inline panel --
    // more robust across UI states, and it's what we need next anyway.
    // Check for "failed" too so a real provider error fails fast with a
    // clear message instead of burning the full timeout.
    await page.locator('nav').getByRole('link', { name: 'History' }).click()
    await expect(async () => {
      await page.reload()
      const failed = page.getByText('failed').first()
      if (await failed.isVisible().catch(() => false)) {
        throw new Error('generation failed (see History page / Render logs for error_code)')
      }
      await expect(page.getByText('succeeded').first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 100_000, intervals: [5_000] })

    const firstResult = page.locator('a[href*="/history/"]').first()
    historyDetailUrl = (await firstResult.getAttribute('href')) ?? ''
    expect(historyDetailUrl).toContain('/history/')
  })

  test('history detail page shows correct dimensions, model, and logo mode', async ({ page }) => {
    test.skip(!historyDetailUrl, 'no generation from previous test')
    await loginAsTestUser(page)
    await page.goto(historyDetailUrl)

    await expect(page.getByText('1200')).toBeVisible()
    await expect(page.getByText('630')).toBeVisible()
    await expect(page.getByText('gpt-image-2')).toBeVisible()
    await expect(page.getByText('watermark')).toBeVisible()
    await expect(page.getByText('succeeded')).toBeVisible()

    const img = page.locator('img').first()
    imageUrl = (await img.getAttribute('src')) ?? ''
    expect(imageUrl).toContain('supabase.co/storage')
  })

  test('generated image is a real 1200x630 PNG in the hosted Supabase bucket', async ({ request }) => {
    test.skip(!imageUrl, 'no image URL from previous test')
    const res = await request.get(imageUrl)
    expect(res.ok()).toBeTruthy()
    expect(res.headers()['content-type']).toContain('image')

    const buf = await res.body()
    // PNG signature + IHDR width/height (big-endian, bytes 16-24)
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    expect(width).toBe(1200)
    expect(height).toBe(630)
  })

  test('download button works with no console errors', async ({ page }) => {
    test.skip(!historyDetailUrl, 'no generation from previous test')
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await loginAsTestUser(page)
    await page.goto(historyDetailUrl)
    await page.getByRole('button', { name: 'Download' }).click()
    await page.waitForTimeout(1_000)

    expect(errors).toEqual([])
  })
})
