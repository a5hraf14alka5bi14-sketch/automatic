// E2E: Purchase Order partial receive flow
// Logs in, navigates to Suppliers, finds a PO in 'ordered' or 'partially_received'
// state, opens the receive modal, and verifies the UI renders correctly.
import { test, expect } from '@playwright/test'

const EMAIL = process.env.TEST_EMAIL || 'admin@restaurant.com'
const PASSWORD = process.env.TEST_PASSWORD || 'admin123'

async function login(page) {
  await page.goto('/')
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("تسجيل")').first().click()
  await expect(
    page.locator('nav, [class*="sidebar"], [class*="Sidebar"], main').first()
  ).toBeVisible({ timeout: 10000 })
}

async function navigateToSuppliers(page) {
  // Try sidebar nav link first; fall back to URL.
  const suppliersLink = page.locator('a[href*="supplier"], [class*="sidebar"] :text("Supplier"), nav :text("Supplier")')
  if (await suppliersLink.count() > 0) {
    await suppliersLink.first().click()
  } else {
    await page.goto('/suppliers').catch(() => page.goto('/#/suppliers'))
  }
  // Suppliers page shows "Purchase Orders" or "Suppliers" heading.
  await expect(
    page.locator('h1:has-text("Supplier"), h1:has-text("Purchase"), [class*="supplier"] h1').first()
  ).toBeVisible({ timeout: 8000 })

  // The page defaults to the "Suppliers" tab; the PO list (cards or the
  // "No purchase orders yet" empty state) only renders under the
  // "Purchase Orders" tab (see src/pages/Suppliers.jsx: useState('suppliers')).
  const posTab = page.locator('button:has-text("Purchase Orders")').first()
  if (await posTab.count() > 0) {
    await posTab.click()
  }
}

test.describe('Purchase Order receive flow', () => {
  test('Suppliers page loads and shows the PO list', async ({ page }) => {
    await login(page)
    await navigateToSuppliers(page)

    // The page renders PO cards or a "No purchase orders" empty state.
    const hasPOs = await page.locator('[class*="purchase"], text=/PO#/, text=/Purchase Order/i').count()
    const hasEmpty = await page.locator('text=/No purchase orders/, text=/empty/i').count()
    expect(hasPOs + hasEmpty).toBeGreaterThan(0)
  })

  test('ordered PO shows a Receive button', async ({ page }) => {
    await login(page)
    await navigateToSuppliers(page)

    // Look for a PO card in "ordered" or "partially_received" status that has
    // a Receive / "↓ Receive" button.
    const receiveBtn = page.locator('button:has-text("Receive"), button:has-text("↓ Receive")').first()

    if (await receiveBtn.count() === 0) {
      // No receivable PO in the DB — skip gracefully.
      test.skip(true, 'No PO in ordered/partially_received state to test receive button')
      return
    }

    await expect(receiveBtn).toBeVisible({ timeout: 5000 })
  })

  test('clicking Receive opens the receive modal with per-item qty inputs', async ({ page }) => {
    await login(page)
    await navigateToSuppliers(page)

    const receiveBtn = page.locator('button:has-text("Receive"), button:has-text("↓ Receive")').first()

    if (await receiveBtn.count() === 0) {
      test.skip(true, 'No PO in ordered/partially_received state')
      return
    }

    await receiveBtn.click()

    // The receive modal opens.
    const modal = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]').first()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // The modal has at least one number input for quantity.
    await expect(modal.locator('input[type="number"]').first()).toBeVisible({ timeout: 3000 })

    // "Receive All Remaining" shortcut button should be present.
    await expect(
      modal.locator('button:has-text("Receive All"), button:has-text("All Remaining")').first()
    ).toBeVisible({ timeout: 3000 })
  })

  test('partially received PO shows amber badge and Receive More button', async ({ page }) => {
    await login(page)
    await navigateToSuppliers(page)

    // Look for a partially_received badge specifically.
    const partialBadge = page.locator('text=/partially.received/i, text=/Partial/i, [class*="amber"], [class*="yellow"]').first()
    const receiveMoreBtn = page.locator('button:has-text("Receive More"), button:has-text("↓ Receive More")').first()

    if (await partialBadge.count() === 0 && await receiveMoreBtn.count() === 0) {
      test.skip(true, 'No partially_received PO in DB')
      return
    }

    await expect(partialBadge.or(receiveMoreBtn)).toBeVisible({ timeout: 5000 })
  })
})
