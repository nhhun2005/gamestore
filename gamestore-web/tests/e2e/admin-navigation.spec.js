import { test, expect } from '@playwright/test';

test('admin uses management navigation and Game Store branding', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: /Administrator/ }).click();
  await expect(page).toHaveURL(/admin\/revenue/);
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav.getByRole('link', { name: /Cửa hàng|Thư viện|Yêu thích/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /GAME STORE/ })).toBeVisible();
  for (const path of ['/store', '/library', '/wishlist']) {
    await page.goto(path);
    await expect(page).toHaveURL(/admin\/revenue/);
  }
  await expect(page.getByText(/Tính từ giao dịch mua thành công sau giảm giá/)).toHaveCount(0);
  await page.goto('/wallet');
  await expect(page.getByRole('button', { name: 'Rút tiền', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /GAME STORE/ }).click();
  await expect(page).toHaveURL(/admin\/revenue/);
});
