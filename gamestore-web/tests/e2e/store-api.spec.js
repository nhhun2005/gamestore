import { test, expect } from "@playwright/test";
import { mockStore } from "./store-fixture.js";

async function setup(page) {
  const user = { id: "11111111-1111-4111-8111-111111111111", username: "Store reader", role: "USER", status: "VERIFIED", balance: "500000.00" };
  const token = `e30.${Buffer.from(JSON.stringify({ id: user.id, sub: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
  await page.addInitScript((jwt) => localStorage.setItem("steam_jwt_token", jwt), token);
  const commerce = { current_user: user, users: [], games: [], promotions: [], transactions: [], game_bought: [], reviews: [], wishlist: [], capabilities: {} };
  await page.route("**/api/commerce/state", (route) => route.fulfill({ json: commerce }));
  await page.route("**/api/commerce/notifications", (route) => route.fulfill({ json: { items: [], unread_count: 0 } }));
  const game = { id: "remote", developer_id: "studio", developer_name: "Server Studio", title: "Game chỉ có ở API chi tiết", description: "Dữ liệu đọc riêng từ view.", price: "100000.00", cover_image_url: null, version: "2.0", status: "AVAILABLE", uploaded_at: "2026-11-15T00:00:00Z", rating: null, genre: "Phiêu lưu", promotion_id: null };
  const store = { ...commerce, games: [game] };
  await mockStore(page, store, user);
  return { game, store };
}

test("real store requests server search and pages, resets page for new literal query", async ({ page }) => {
  const { game } = await setup(page);
  const calls = [];
  await page.route("**/api/store/games?**", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q"), currentPage = Number(url.searchParams.get("page"));
    calls.push({ q, page: currentPage });
    const items = q ? [{ ...game, title: "Kết quả do server chọn" }] : [{ ...game, title: currentPage ? "Trang thứ hai" : "Trang đầu tiên" }];
    return route.fulfill({ json: { items, promotions: [], total: q ? 1 : 21, page: currentPage, size: 20 } });
  });
  await page.goto("/store");
  await expect(page.getByRole("heading", { name: "Trang đầu tiên" })).toBeVisible();
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page.getByRole("heading", { name: "Trang thứ hai" })).toBeVisible();
  await page.getByRole("textbox", { name: "Tìm trong cửa hàng" }).fill("%_Tiếng Việt");
  await expect(page.getByRole("heading", { name: "Kết quả do server chọn" })).toBeVisible();
  expect(calls.at(-1)).toEqual({ q: "%_Tiếng Việt", page: 0 });
  expect(calls.some((call) => call.page === 1)).toBe(true);
});

test("slow previous search cannot overwrite a newer response", async ({ page }) => {
  const { game } = await setup(page);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let slowStarted = false;
  await page.route("**/api/store/games?**", async (route) => {
    const q = new URL(route.request().url()).searchParams.get("q");
    if (q === "slow") { slowStarted = true; await held; }
    await route.fulfill({ json: { items: [{ ...game, title: q === "fast" ? "Kết quả mới" : q === "slow" ? "Kết quả cũ" : "Ban đầu" }], promotions: [], total: 1, page: 0, size: 20 } });
  });
  await page.goto("/store");
  await expect(page.getByRole("heading", { name: "Ban đầu" })).toBeVisible();
  const search = page.getByRole("textbox", { name: "Tìm trong cửa hàng" });
  await search.fill("slow");
  await expect.poll(() => slowStarted).toBe(true);
  await search.fill("fast");
  await expect(page.getByRole("heading", { name: "Kết quả mới" })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "Kết quả cũ" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Kết quả mới" })).toBeVisible();
});

test("detail loads independently of commerce snapshot and distinguishes retryable errors from 404", async ({ page }) => {
  const { game } = await setup(page);
  await page.goto("/games/remote");
  await expect(page.getByRole("heading", { name: game.title, level: 1 })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Server Studio");
  await expect(page.getByRole("main")).toContainText("Dữ liệu đọc riêng từ view.");
  await page.reload();
  await expect(page.getByRole("heading", { name: game.title, level: 1 })).toBeVisible();
  let failed = true;
  await page.route("**/api/store/games/remote", (route) => failed
    ? route.fulfill({ status: 503, json: { message: "Không đọc được chi tiết." } })
    : route.fulfill({ json: { game, promotions: [], reviews: [], owned: false } }));
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText("Không đọc được chi tiết.");
  failed = false;
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { name: game.title, level: 1 })).toBeVisible();
  await page.goto("/games/not-found");
  await expect(page.getByRole("heading", { name: "Không tìm thấy trò chơi" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
