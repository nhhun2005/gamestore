import { test, expect } from "@playwright/test";

async function setup(page, role = "ADMINISTRATOR") {
  const user = { id: "11111111-1111-4111-8111-111111111111", username: "Genre Admin", role, status: "VERIFIED", balance: "0.00" };
  const claims = { id: user.id, sub: user.username, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;
  await page.addInitScript(value => localStorage.setItem("steam_jwt_token", value), token);
  let genres = [{ id: "action", name: "Hành động", description: "Nhanh và mạnh", game_count: 1 }, { id: "rpg", name: "Nhập vai", description: "", game_count: 1 }];
  const games = [{ id: "game", title: "Trò chơi thử nghiệm", status: "HIDDEN", genre_ids: ["action", "rpg"] }];
  let sequence = 0;
  await page.route("**/api/commerce/state", route => route.fulfill({ json: { current_user: user, users: [], games: [], promotions: [], transactions: [], game_bought: [], reviews: [], capabilities: {} } }));
  await page.route("**/api/catalog/manage", route => route.fulfill({ json: { games: [], genres: [], developers: [] } }));
  await page.route("**/api/admin/genres**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/api/admin/genres", ""), method = request.method();
    const parts = path.split("/").filter(Boolean);
    const genre = genres.find(g => g.id === parts[0]);
    if (method === "GET") return route.fulfill({ json: path === "/games" ? games : genres });
    if (parts[1] === "games") {
      if (method === "PUT" && !games[0].genre_ids.includes(genre.id)) games[0].genre_ids.push(genre.id);
      if (method === "DELETE") games[0].genre_ids = games[0].genre_ids.filter(id => id !== genre.id);
      genres.forEach(g => { g.game_count = games.filter(game => game.genre_ids.includes(g.id)).length; });
      return route.fulfill({ status: 204 });
    }
    if (method === "DELETE") {
      if (genre.game_count) return route.fulfill({ status: 409, json: { message: "Thể loại đang được sử dụng." } });
      genres = genres.filter(g => g.id !== genre.id);
      return route.fulfill({ status: 204 });
    }
    const body = request.postDataJSON();
    if (genres.some(g => g.id !== genre?.id && g.name.toLowerCase() === body.name.toLowerCase()))
      return route.fulfill({ status: 409, json: { message: "Tên thể loại đã tồn tại." } });
    const result = genre || { id: `new-${++sequence}`, game_count: 0 };
    Object.assign(result, body);
    if (!genre) genres.push(result);
    return route.fulfill({ status: genre ? 200 : 201, json: result });
  });
}

test("admin catalog, genre CRUD and multiple game assignments", async ({ page }) => {
  await setup(page);
  await page.goto("/admin/games");
  await expect(page.getByRole("heading", { name: "Danh sách trò chơi" })).toBeVisible();
  await page.getByRole("link", { name: "Quản lý thể loại trò chơi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Danh sách thể loại (2)" })).toBeVisible();
  await page.getByRole("button", { name: "Xóa Hành động", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xác nhận xóa" })).toBeDisabled();
  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await page.getByRole("button", { name: "Gỡ khỏi Trò chơi thử nghiệm" }).click();
  await expect(page.getByText("Nhập vai", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Gán cho Trò chơi thử nghiệm" })).toBeEnabled();
  await page.getByRole("button", { name: "Gán cho Trò chơi thử nghiệm" }).click();
  await expect(page.getByText(/^(Hành động, Nhập vai|Nhập vai, Hành động)$/)).toBeVisible();
  await page.getByRole("button", { name: "Thêm thể loại", exact: true }).click();
  await page.getByLabel("Tên thể loại").fill("Hành động");
  await page.getByRole("button", { name: "Lưu thể loại" }).click();
  await expect(page.getByRole("alert")).toHaveText("Tên thể loại đã tồn tại.");
  await page.getByLabel("Tên thể loại").fill("Chiến thuật");
  await page.getByLabel("Mô tả", { exact: true }).fill("Tư duy chiến lược");
  await page.getByRole("button", { name: "Lưu thể loại" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sửa Chiến thuật" }).click();
  await page.getByLabel("Tên thể loại").fill("Chiến thuật mới");
  await page.getByRole("button", { name: "Lưu thể loại" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Tìm thể loại").fill("chiến");
  await expect(page.getByRole("button", { name: "Sửa Hành động" })).toHaveCount(0);
  await page.getByRole("button", { name: "Xóa Chiến thuật mới" }).click();
  await page.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Không có thể loại phù hợp.")).toBeVisible();
  await page.getByLabel("Tìm thể loại").fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Tìm trò chơi")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "output/playwright/genres-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "output/playwright/genres-desktop.png", fullPage: true });
});

test("non-admin is denied", async ({ page }) => {
  await setup(page, "USER");
  await page.goto("/admin/games/genres");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
});

test("load failure and empty catalog", async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route("**/api/admin/genres**", route => fail
    ? route.fulfill({ status: 503, json: { message: "Máy chủ đang bận." } })
    : route.fulfill({ json: [] }));
  await page.goto("/admin/games/genres");
  await expect(page.getByRole("alert")).toContainText("Máy chủ đang bận.");
  fail = false;
  await page.getByRole("button", { name: "Tải lại dữ liệu" }).click();
  await expect(page.getByText("Chưa có thể loại nào. Hãy thêm thể loại đầu tiên.")).toBeVisible();
});
