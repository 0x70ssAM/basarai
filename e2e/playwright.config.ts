import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.join(__dirname, '.env') })

// Defaults to the live Render staging deployment. Override with
// BASE_URL=http://localhost:3000 to run against a local dev/Docker
// instance instead -- nothing here hardcodes localhost as the only target.
const baseURL = process.env.BASE_URL ?? 'https://basarai-staging.onrender.com'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // shared account + real OpenAI calls -- keep deterministic, not parallel
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
