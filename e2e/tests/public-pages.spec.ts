import { test, expect } from '@playwright/test'

test.describe('public pages', () => {
  test('home page loads and does not leak a localhost URL', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    const response = await page.goto('/')
    expect(response?.ok()).toBeTruthy()

    // Unauthenticated root should land on /login or render its own public
    // content -- either way, must never resolve to a localhost origin.
    expect(page.url()).not.toContain('localhost')
    expect(page.url()).not.toContain('127.0.0.1')

    expect(errors, `console errors: ${errors.join('; ')}`).toEqual([])
  })

  test('/login renders the login form', async ({ page }) => {
    await page.goto('/login')
    // "Log in" text matches both the card title and the submit button, so
    // assert on the unique subcopy instead of the ambiguous title text.
    await expect(page.getByText('Enter your email and password to access your studio.')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
  })

  test('/signup renders the signup form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByText('Create an account', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  })

  test('login <-> signup navigation works', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Sign up' }).click()
    await expect(page).toHaveURL(/\/signup/)
    await page.getByRole('link', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('unknown route does not crash and does not expose localhost', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist-e2e')
    // Next.js 404 or a redirect to /login are both acceptable; a 500 is not.
    expect(response?.status()).toBeLessThan(500)
    expect(page.url()).not.toContain('localhost')
  })
})
