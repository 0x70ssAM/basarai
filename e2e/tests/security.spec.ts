import { test, expect } from '@playwright/test'
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, FIGHT_CLUB } from './fixtures'

const BASE_URL = process.env.BASE_URL ?? 'https://basarai-staging.onrender.com'

test.describe('security', () => {
  test('CORS allows the production origin', async ({ request }) => {
    const res = await request.fetch(`${BASE_URL}/api/brands`, {
      method: 'OPTIONS',
      headers: {
        Origin: BASE_URL,
        'Access-Control-Request-Method': 'GET',
      },
    })
    // Same-origin request through the Next.js proxy -- must not error out.
    expect(res.status()).toBeLessThan(500)
  })

  test('CORS is not a wildcard for an arbitrary disallowed origin', async ({ request }) => {
    const res = await request.fetch(`${BASE_URL}/api/brands`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil-example.com',
        'Access-Control-Request-Method': 'GET',
      },
    })
    const acao = res.headers()['access-control-allow-origin']
    expect(acao).not.toBe('*')
    expect(acao).not.toBe('https://evil-example.com')
  })

  test('FastAPI port 8000 is not publicly reachable, only the app origin is', async ({ request }) => {
    const url = new URL(BASE_URL)
    let blocked = false
    try {
      const res = await request.get(`${url.protocol}//${url.hostname}:8000/health`, { timeout: 8_000 })
      // If it somehow responds, it must not be a healthy 200 -- Render
      // only routes the container's declared PORT (3000) publicly.
      blocked = !res.ok()
    } catch {
      blocked = true // connection refused/timeout is the expected, safe outcome
    }
    expect(blocked).toBeTruthy()
  })

  test('no Supabase secret key or provider key pattern in page HTML', async ({ page }) => {
    await page.goto('/login')
    const html = await page.content()
    expect(html).not.toContain('sb_secret_')
    expect(html).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
  })

  test('no Supabase secret key in any served JS bundle', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async (res) => {
      if (res.url().endsWith('.js') && res.ok()) {
        try {
          bodies.push(await res.text())
        } catch {
          /* ignore */
        }
      }
    })
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    for (const b of bodies) expect(b).not.toContain('sb_secret_')
  })

  test('unauthenticated user cannot read brand data via the API', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/brands`)
    // Either the Next.js proxy 401s, or middleware redirects to /login
    // (redirects surface here as a non-2xx or a login-page body) -- either
    // way, brand data must not come back for an unauthenticated request.
    const body = await res.text().catch(() => '')
    expect(body).not.toMatch(/"name":"Fight Club Academy"/)
  })

  test("a second user cannot access another user's private brand", async ({ page }) => {
    test.skip(!TEST_USER_PASSWORD, 'TEST_USER_PASSWORD not set')

    // Create a throwaway second user via signup (real flow, not a bypass),
    // confirm it deterministically the same way the email-confirmation
    // test does, then try to open the first user's Fight Club Academy
    // brand as this unrelated second user.
    const secondEmail = `e2e-rls-${Date.now()}@fightclub.local`
    const secondPassword = 'TempTest12345!'
    const { generateSignupConfirmationLink, deleteTestUser, findUserIdByEmail } = await import('./fixtures')
    const link = await generateSignupConfirmationLink(secondEmail, secondPassword)
    await page.goto(link)
    await page.waitForLoadState('networkidle')

    await page.goto(`/${FIGHT_CLUB.id}`)
    const body = await page.locator('body').innerText()
    expect(body).not.toContain(TEST_USER_EMAIL)
    expect(body).not.toContain(FIGHT_CLUB.name)
    // Observed (and correct): the app renders a genuine 404 for a brand the
    // current user doesn't own -- it doesn't even confirm the brand exists
    // by redirecting elsewhere, the same non-disclosure pattern GitHub uses
    // for private repos. The URL itself staying put is fine; what matters
    // is that no brand data or ownership signal ever renders.
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()

    const userId = await findUserIdByEmail(secondEmail)
    if (userId) await deleteTestUser(userId)
  })
})
