// E2E: Login flow
// Verifies that a user can reach the login page, submit credentials, and land
// on the authenticated dashboard.  Credentials come from env vars so the test
// works against any environment without hard-coding secrets.
import { test, expect } from '@playwright/test'

const EMAIL = process.env.TEST_EMAIL || 'admin@restaurant.com'
const PASSWORD = process.env.TEST_PASSWORD || 'admin123'

test.describe('Login flow', () => {
  test('unauthenticated request redirects to or shows the login form', async ({ page }) => {
    await page.goto('/')
    // The app renders a login form (email + password) when unauthenticated.
    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('invalid credentials show an error message', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type="email"], input[name="email"]').first().fill('notreal@example.com')
    await page.locator('input[type="password"]').first().fill('wrongpassword')
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("تسجيل")').first().click()

    // Some error text must appear — message can be in Arabic or English.
    await expect(
      page.locator('[class*="error"], [class*="red"], [role="alert"]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('valid credentials log in and show the main app', async ({ page }) => {
    await page.goto('/')
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
    await page.locator('input[type="password"]').first().fill(PASSWORD)
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("تسجيل")').first().click()

    // After login the main layout (sidebar or dashboard) becomes visible.
    await expect(
      page.locator('nav, [class*="sidebar"], [class*="Sidebar"], main').first()
    ).toBeVisible({ timeout: 10000 })

    // Should no longer show the login form.
    await expect(page.locator('input[type="password"]')).not.toBeVisible()
  })

  test('authenticated user stays logged in on reload', async ({ page }) => {
    // Log in first.
    await page.goto('/')
    await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
    await page.locator('input[type="password"]').first().fill(PASSWORD)
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("تسجيل")').first().click()
    await expect(
      page.locator('nav, [class*="sidebar"], [class*="Sidebar"], main').first()
    ).toBeVisible({ timeout: 10000 })

    // Reload — JWT cookie should keep the session alive.
    await page.reload()
    await expect(page.locator('input[type="password"]')).not.toBeVisible({ timeout: 5000 })
  })
})
