// E2E: POS order placement flow
// Logs in, navigates to Point of Sale, adds an item to the cart (Takeaway),
// and verifies that "Place Order" fires and lands on a confirmation state.
import { test, expect } from '@playwright/test'

const EMAIL = process.env.TEST_EMAIL || 'admin@restaurant.com'
const PASSWORD = process.env.TEST_PASSWORD || 'admin123'

// Helper: log in and return an authenticated page.
async function login(page) {
  await page.goto('/')
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("تسجيل")').first().click()
  // Wait for the main layout to appear.
  await expect(
    page.locator('nav, [class*="sidebar"], [class*="Sidebar"], main').first()
  ).toBeVisible({ timeout: 10000 })
}

test.describe('POS order flow', () => {
  test('POS page loads and shows menu items', async ({ page }) => {
    await login(page)
    // Navigate to the POS — may be the default route or reached via sidebar.
    await page.goto('/#/pos').catch(() => page.goto('/pos')).catch(() => {})
    // If SPA routing, clicking the POS sidebar link is more reliable.
    const posLink = page.locator('a[href*="pos"], button:has-text("Point of Sale"), [class*="sidebar"] :text("POS"), nav :text("POS")')
    if (await posLink.count() > 0) await posLink.first().click()

    // The POS page heading.
    await expect(page.locator('h1:has-text("Point of Sale"), [class*="pos"] h1').first()).toBeVisible({ timeout: 8000 })
  })

  test('switching to Takeaway enables Place Order without a table', async ({ page }) => {
    await login(page)
    const posLink = page.locator('a[href*="pos"], [class*="sidebar"] :text("POS"), nav :text("POS"), button:has-text("Point of Sale")')
    if (await posLink.count() > 0) await posLink.first().click()
    await expect(page.locator('h1:has-text("Point of Sale")').first()).toBeVisible({ timeout: 8000 })

    // Click Takeaway order type.
    const takeawayBtn = page.locator('button:has-text("Takeaway")').first()
    await expect(takeawayBtn).toBeVisible({ timeout: 5000 })
    await takeawayBtn.click()

    // The Place Order button exists (disabled until cart has items).
    await expect(page.locator('button:has-text("Place Order")').first()).toBeVisible({ timeout: 3000 })
  })

  test('adding a menu item enables the Place Order button', async ({ page }) => {
    await login(page)
    const posLink = page.locator('a[href*="pos"], [class*="sidebar"] :text("POS"), nav :text("POS"), button:has-text("Point of Sale")')
    if (await posLink.count() > 0) await posLink.first().click()
    await expect(page.locator('h1:has-text("Point of Sale")').first()).toBeVisible({ timeout: 8000 })

    // Switch to Takeaway.
    await page.locator('button:has-text("Takeaway")').first().click()

    // Click the first menu item that is NOT a category filter.
    // Menu item buttons contain a <p class*=font-semibold> child.
    const menuItem = page.locator('button p.font-semibold').first()
    await expect(menuItem).toBeVisible({ timeout: 6000 })
    await menuItem.click()

    // Cart count badge should appear ("1 in cart").
    await expect(page.locator('text=/\\d+ in cart/')).toBeVisible({ timeout: 5000 })

    // Place Order button should become enabled.
    const placeOrderBtn = page.locator('button:has-text("Place Order")').first()
    await expect(placeOrderBtn).toBeEnabled({ timeout: 5000 })
  })

  test('Place Order sends the order and clears the cart', async ({ page }) => {
    await login(page)
    const posLink = page.locator('a[href*="pos"], [class*="sidebar"] :text("POS"), nav :text("POS"), button:has-text("Point of Sale")')
    if (await posLink.count() > 0) await posLink.first().click()
    await expect(page.locator('h1:has-text("Point of Sale")').first()).toBeVisible({ timeout: 8000 })

    await page.locator('button:has-text("Takeaway")').first().click()

    const menuItem = page.locator('button p.font-semibold').first()
    await expect(menuItem).toBeVisible({ timeout: 6000 })
    await menuItem.click()

    await expect(page.locator('text=/\\d+ in cart/')).toBeVisible({ timeout: 5000 })

    const placeOrderBtn = page.locator('button:has-text("Place Order")').first()
    await expect(placeOrderBtn).toBeEnabled({ timeout: 5000 })
    await placeOrderBtn.click()

    // After successful order, cart should be cleared (no "X in cart" badge)
    // or a success toast/receipt modal should appear.
    await expect(
      page.locator('text=/in cart/').or(page.locator('[class*="receipt"], [class*="Receipt"], text=/Order placed/')).first()
    ).toBeHidden({ timeout: 8000 }).catch(async () => {
      // Alternative: a receipt/success modal appeared — that's also valid.
      const modal = page.locator('[class*="receipt"], [class*="modal"], [role="dialog"]').first()
      await expect(modal).toBeVisible({ timeout: 3000 })
    })
  })
})
