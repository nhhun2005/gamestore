import { test, expect } from "@playwright/test";
import { statSync } from "node:fs";
import { mockStore } from "./store-fixture.js";

async function setup(page) {
  const user = { id: "11111111-1111-4111-8111-111111111111", username: "Người chơi", role: "USER", status: "VERIFIED", balance: "1000000.00" };
  const game = { id: "journey", developer_id: "studio", title: "Hành trình Đà Lạt", description: "Khám phá những khu rừng và thành phố trong sương.\nMột hành trình của riêng bạn.", price: "200000.00", cover_image_url: "/src/assets/hero.png", status: "AVAILABLE", promotion_id: "sale", rating: 4.5, genre: "Phiêu lưu, Nhập vai" };
  const hidden = { ...game, id: "owned-hidden", title: "Khu vườn bí mật", status: "HIDDEN", promotion_id: null, rating: null, cover_image_url: null };
  const free = { ...game, id: "free", title: "Game miễn phí", price: "0.00", promotion_id: null, rating: null };
  const special = { ...game, id: "special", title: "Chuyến đi: Hà Nội / 2026?", promotion_id: null, cover_image_url: "/missing-cover.png" };
  const state = {
    current_user: user, users: [{ id: "studio", username: "Sen Studio", role: "DEVELOPER" }, { id: "reviewer", username: "Khách chơi", role: "USER" }],
    games: [game, hidden, free, special], promotions: [{ id: "sale", name: "Ưu đãi", discount: "25", status: "ENABLED" }],
    transactions: [{ id: "old-purchase", user_id: user.id, game_id: hidden.id, amount: hidden.price, type: "BUY", status: "SUCCESSED", created_at: "2026-10-01T00:00:00Z" }],
    game_bought: [{ user_id: user.id, game_id: hidden.id, transaction_id: "old-purchase" }],
    reviews: [{ id: "review", user_id: "reviewer", game_id: game.id, rating: 4.5, content: "Một chuyến phiêu lưu đáng nhớ." }], wishlist: [], capabilities: {},
  };
  const calls = { purchases: [], wishlist: [], failWishlist: false, failPurchase: false };
  const token = `e30.${Buffer.from(JSON.stringify({ id: user.id, sub: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await page.addInitScript((value) => localStorage.setItem("steam_jwt_token", value), token);
  await mockStore(page, state, user);
  await page.route("**/api/commerce/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/api/commerce", "");
    if (path === "/state") return route.fulfill({ json: state });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unread_count: 0 } });
    if (path === "/purchases") {
      const body = request.postDataJSON(); calls.purchases.push(body);
      if (calls.failPurchase) return route.fulfill({ status: 409, json: { message: "Giá đã thay đổi. Kiểm tra lại." } });
      const transaction = { id: `purchase-${calls.purchases.length}`, user_id: user.id, game_id: body.game_id, type: "BUY", amount: body.expected_amount, status: "SUCCESSED", created_at: "2026-11-10T05:00:00Z" };
      state.transactions.push(transaction);
      state.game_bought.push({ user_id: user.id, game_id: body.game_id, transaction_id: transaction.id });
      return route.fulfill({ status: 201, json: transaction });
    }
    if (path.startsWith("/wishlist/")) {
      calls.wishlist.push(request.method());
      if (calls.failWishlist) return route.fulfill({ status: 503, json: { message: "Chưa lưu được yêu thích." } });
      const id = decodeURIComponent(path.split("/").at(-1));
      if (request.method() === "POST") state.wishlist.push({ game_id: id, created_at: "2026-11-10T05:00:00Z" });
      else state.wishlist = state.wishlist.filter((entry) => entry.game_id !== id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404, json: { message: "Không tìm thấy." } });
  });
  return { state, calls, game, hidden, special };
}

async function assertEmptyDownload(page, filename) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải game", exact: true }).click();
  const file = await waiting;
  expect(file.suggestedFilename()).toBe(filename);
  expect(statSync(await file.path()).size).toBe(0);
}

test('gateway and wallet have distinct colors and only the gateway shows loading when it is selected', async ({ page }) => {
  const { state, calls } = await setup(page);
  state.capabilities.sandbox_payments = true;
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  let gatewayCalls = 0, gatewayKey;
  await page.route('**/api/commerce/checkouts', async (route) => {
    gatewayCalls++;
    gatewayKey = route.request().headers()['idempotency-key'];
    await hold;
    await route.fulfill({ status: 503, json: { message: 'Chưa tạo được đơn GameStore Pay.' } });
  });
  await page.goto('/games/journey');
  await page.getByRole('button', { name: 'Mua game', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const gateway = dialog.getByRole('region', { name: 'GameStore Pay', exact: true }).getByRole('button');
  const wallet = dialog.getByRole('region', { name: 'Ví GameStore', exact: true }).getByRole('button').first();
  expect(await gateway.evaluate((button) => getComputedStyle(button).backgroundImage)).not.toBe(await wallet.evaluate((button) => getComputedStyle(button).backgroundImage));
  try {
    await gateway.click();
    await expect(gateway).toHaveText('Đang tạo đơn GameStore Pay…');
    await expect(gateway).toHaveAttribute('aria-busy', 'true');
    await expect(wallet).toHaveText('Thanh toán bằng ví');
    await expect(wallet).toHaveAttribute('aria-busy', 'false');
    await expect(wallet).toBeDisabled();
    await wallet.evaluate((button) => button.click());
    expect(calls.purchases).toHaveLength(0);
    expect(gatewayCalls).toBe(1);
    await wallet.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'output/playwright/checkout-gateway-loading.png', fullPage: true });
  } finally { release(); }
  await expect(dialog.getByRole('alert')).toHaveText('Chưa tạo được đơn GameStore Pay.');
  await expect(wallet).toBeEnabled();
  await expect(gateway).toHaveText('Thanh toán qua GameStore Pay');
  const purchaseRequest = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/commerce/purchases');
  await wallet.click();
  const request = await purchaseRequest;
  expect(request.headers()['idempotency-key']).not.toBe(gatewayKey);
  await expect(page.getByRole('heading', { name: 'Đã thêm vào thư viện', exact: true })).toBeVisible();
  expect(calls.purchases).toHaveLength(1);
});

test('wallet checkout does not show gateway loading or submit a gateway request', async ({ page }) => {
  const { state } = await setup(page);
  state.capabilities.sandbox_payments = true;
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  let walletCalls = 0, gatewayCalls = 0;
  await page.route('**/api/commerce/purchases', async (route) => {
    walletCalls++;
    await hold;
    await route.fulfill({ status: 503, json: { message: 'Chưa thanh toán được bằng ví.' } });
  });
  await page.route('**/api/commerce/checkouts', async (route) => {
    gatewayCalls++;
    await route.fulfill({ status: 503, json: { message: 'Unexpected gateway call' } });
  });
  await page.goto('/games/journey');
  await page.getByRole('button', { name: 'Mua game', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const gateway = dialog.getByRole('region', { name: 'GameStore Pay', exact: true }).getByRole('button');
  const wallet = dialog.getByRole('region', { name: 'Ví GameStore', exact: true }).getByRole('button').first();
  try {
    await wallet.click();
    await expect(wallet).toHaveText('Đang thanh toán bằng ví…');
    await expect(wallet).toHaveAttribute('aria-busy', 'true');
    await expect(gateway).toHaveText('Thanh toán qua GameStore Pay');
    await expect(gateway).toHaveAttribute('aria-busy', 'false');
    await expect(gateway).toBeDisabled();
    await gateway.evaluate((button) => button.click());
    expect(walletCalls).toBe(1);
    expect(gatewayCalls).toBe(0);
  } finally { release(); }
  await expect(dialog.getByRole('alert')).toHaveText('Chưa thanh toán được bằng ví.');
  await expect(gateway).toBeEnabled();
  await expect(wallet).toHaveText('Thanh toán bằng ví');
});

test("detail URL loads directly and on reload with real metadata, reviews, price and no modal", async ({ page }) => {
  const { calls, game } = await setup(page);
  await page.goto("/games/journey");
  await expect(page.getByRole("heading", { name: game.title, level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("Sen Studio");
  await expect(page.getByRole("main")).toContainText("Một chuyến phiêu lưu đáng nhớ.");
  await expect(page.getByRole("main")).toContainText("150.000");
  await expect(page.getByRole("main")).not.toContainText("Cấu hình");
  await expect(page.getByRole("button", { name: "Tải game", exact: true })).toHaveCount(0);
  expect(calls.purchases).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: game.title, level: 1 })).toBeVisible();
  await page.screenshot({ path: "output/playwright/game-details-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/game-details-mobile.png", fullPage: true });
});

test("purchase confirmation remains explicit and unlocks an empty game-named download", async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto("/games/journey");
  await page.getByRole("button", { name: "Mua game", exact: true }).click();
  expect(calls.purchases).toHaveLength(0);
  await page.getByRole("dialog").getByRole("button", { name: "Thanh toán bằng ví", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đã thêm vào thư viện" })).toBeVisible();
  await page.getByRole("button", { name: "Đóng hộp thoại", exact: true }).click();
  expect(calls.purchases).toEqual([{ game_id: "journey", expected_amount: "150000.00" }]);
  await assertEmptyDownload(page, "Hành trình Đà Lạt.md");
  await page.goto("/library");
  await page.getByRole("button", { name: "Hành trình Đà Lạt", exact: true }).click();
  await assertEmptyDownload(page, "Hành trình Đà Lạt.md");
  expect(calls.purchases).toHaveLength(1);
});

test("owned hidden game still downloads; hidden unowned and unknown games cannot be bought or downloaded", async ({ page }) => {
  const { state, calls } = await setup(page);
  await page.goto("/games/owned-hidden");
  await assertEmptyDownload(page, "Khu vườn bí mật.md");
  await expect(page.getByRole("button", { name: "Mua game", exact: true })).toHaveCount(0);
  state.game_bought = [];
  await page.reload();
  await expect(page.getByRole("button", { name: "Tải game", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mua game", exact: true })).toHaveCount(0);
  await page.goto("/games/not-a-game");
  await expect(page.getByRole("heading", { name: "Không tìm thấy trò chơi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tải game", exact: true })).toHaveCount(0);
  expect(calls.purchases).toHaveLength(0);
});

test("wishlist errors are visible and wishlist entries open a detail page", async ({ page }) => {
  const { calls } = await setup(page);
  calls.failWishlist = true;
  await page.goto("/games/journey");
  await page.getByRole("button", { name: /Thêm vào.*yêu thích/ }).click();
  await expect(page.getByRole("alert")).toContainText("Chưa lưu được yêu thích.");
  calls.failWishlist = false;
  await page.getByRole("button", { name: /Thêm vào.*yêu thích/ }).click();
  await expect(page.getByRole("button", { name: /Bỏ.*yêu thích/ })).toBeVisible();
  await page.goto("/wishlist");
  await page.getByRole("link", { name: /Mua ngay|Xem chi tiết/ }).click();
  await expect(page).toHaveURL(/\/games\/journey$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("failed purchase never grants a download and unsafe filename characters are sanitized", async ({ page }) => {
  const { state, calls, special } = await setup(page);
  calls.failPurchase = true;
  await page.goto("/games/journey");
  await page.getByRole("button", { name: "Mua game", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Thanh toán bằng ví", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Giá đã thay đổi.");
  await page.getByRole("button", { name: "Đóng hộp thoại", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tải game", exact: true })).toHaveCount(0);
  state.game_bought.push({ user_id: state.current_user.id, game_id: special.id, transaction_id: "special-purchase" });
  await page.goto("/games/special");
  await expect(page.getByRole("heading", { name: special.title, level: 1 })).toBeVisible();
  await assertEmptyDownload(page, "Chuyến đi_ Hà Nội _ 2026_.md");
});

test("free game requires confirmation and detail links survive browser back navigation", async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto("/store");
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Game miễn phí", exact: true }) }).getByRole("link", { name: "Xem chi tiết" }).click();
  await expect(page).toHaveURL(/\/games\/free$/);
  await page.getByRole("button", { name: "Thêm miễn phí vào thư viện", exact: true }).click();
  expect(calls.purchases).toHaveLength(0);
  await page.getByRole("dialog").getByRole("button", { name: "Thêm miễn phí vào thư viện", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đã thêm vào thư viện" })).toBeVisible();
  await page.getByRole("button", { name: "Đóng hộp thoại", exact: true }).click();
  await assertEmptyDownload(page, "Game miễn phí.md");
  await page.goBack();
  await expect(page).toHaveURL(/\/store$/);
  await page.goForward();
  await expect(page.getByRole("button", { name: "Tải game", exact: true })).toBeVisible();
});
