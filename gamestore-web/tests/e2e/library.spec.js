import { test, expect } from '@playwright/test';

async function enter(page, name = 'Huỳnh') {
  await page.goto('/demo');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.goto('/library');
}
async function create(page, name) {
  await page.getByRole('button', { name: 'Tạo bộ sưu tập', exact: true }).click();
  await page.getByLabel('Tên bộ sưu tập', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Lưu bộ sưu tập' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('library CRUD, notes and hidden games persist while ownership stays permanent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await enter(page);
  await page.goto('/store');
  await page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Celeste', exact: true }) }).getByRole('link', { name: 'Xem chi tiết' }).click();
  await page.getByRole('button', { name: 'Thêm miễn phí vào thư viện', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm miễn phí vào thư viện', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Đã thêm vào thư viện' })).toBeVisible();
  await page.goto('/library');
  await create(page, 'Indie');
  await page.getByRole('button', { name: 'Thêm game vào bộ sưu tập', exact: true }).click();
  await page.getByLabel('Game trong thư viện').selectOption({ label: 'Celeste' });
  await page.getByRole('button', { name: 'Thêm vào bộ sưu tập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Celeste', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ghi chú riêng tư', exact: true }).click();
  await page.getByLabel('Ghi chú riêng tư', { exact: true }).fill('Chơi cuối tuần');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await expect(page.getByText('Chơi cuối tuần', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đổi tên', exact: true }).click();
  await page.getByLabel('Tên bộ sưu tập', { exact: true }).fill('Cuối tuần');
  await page.getByRole('button', { name: 'Lưu bộ sưu tập' }).click();
  await expect(page.getByLabel('Bộ sưu tập', { exact: true })).toContainText('Cuối tuần');
  await page.getByRole('button', { name: 'Ẩn game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Celeste', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Game đã ẩn (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Celeste', exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel('Hiển thị game').selectOption('hidden');
  await expect(page.getByText('Chơi cuối tuần', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hiện lại game' }).click();
  await expect(page.getByLabel('Hiển thị game')).toHaveValue('visible');
  await expect(page.getByRole('heading', { name: 'Celeste', exact: true })).toBeVisible();
  await page.getByLabel('Hiển thị game').selectOption('visible');
  await page.getByLabel('Bộ sưu tập', { exact: true }).selectOption({ label: 'Cuối tuần' });
  await page.getByRole('button', { name: 'Bỏ khỏi bộ sưu tập' }).click();
  await expect(page.getByRole('heading', { name: 'Celeste', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xóa bộ sưu tập', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa bộ sưu tập' }).click();
  await expect(page.getByRole('heading', { name: 'Celeste', exact: true })).toBeVisible();
  await expect(page.getByText('Chơi cuối tuần', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/library-crud-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('personal collections remain separated when switching USER and DEVELOPER', async ({ page }) => {
  for (const name of ['Huỳnh', 'Aurora Studio']) {
    await enter(page, name);
    await expect(page.getByLabel('Bộ sưu tập', { exact: true })).not.toContainText('Riêng tư');
    await create(page, 'Riêng tư');
    await page.goto('/wallet');
    await expect(page.getByRole('button', { name: 'Tiếp tục nạp tiền' })).toBeEnabled();
  }
});
