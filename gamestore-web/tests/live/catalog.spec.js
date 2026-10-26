import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("real catalog API: developer draft, admin review, store publication and reapproval", async ({
  page,
  request,
}) => {
  const fixture = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  async function login(account, path) {
    await page.goto("/login");
    await page
      .getByPlaceholder("Nhập username hoặc email...")
      .fill(account.username);
    await page.getByPlaceholder("••••••••").fill(account.password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/store/);
    await page.goto(path);
  }
  const response = await request.post(`${fixture.api}/auth/login`, {
    data: { account: fixture.admin.username, password: fixture.admin.password },
  });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json();
  const name = `Live genre ${Date.now()}`;
  const genreResponse = await request.post(`${fixture.api}/admin/genres`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
  expect(genreResponse.status()).toBe(201);
  const title = `Live catalog ${Date.now()}`;
  await login(fixture.developer, "/manage-games/new");
  await page.getByLabel("Tên trò chơi", { exact: true }).fill(title);
  await page
    .getByLabel("Mô tả trò chơi")
    .fill("Real PostgreSQL and browser integration");
  await page.getByLabel("Giá (VND)").fill("25000.50");
  await page.getByLabel(name, { exact: true }).check();
  await page.getByRole("button", { name: "Tạo trò chơi", exact: true }).click();
  await expect(page).toHaveURL(/\/manage-games$/);
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card
    .getByRole("button", { name: "Đăng tải trò chơi", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận gửi đơn" }).click();
  await expect(
    card.getByRole("button", { name: "Đang chờ duyệt" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await login(fixture.admin, "/admin/games/submissions");
  await page.getByLabel("Tìm đơn theo game hoặc developer").fill(title);
  await page.getByRole("button", { name: "Tìm đơn", exact: true }).click();
  await page.getByRole("button", { name: "Xem đơn", exact: true }).click();
  await page
    .getByLabel("Lý do duyệt hoặc từ chối")
    .fill("Đủ điều kiện phát hành");
  await page.getByLabel("Quyết định", { exact: true }).selectOption("ACCEPTED");
  await page.getByRole("button", { name: "Xác nhận xét duyệt" }).click();
  await expect(
    page.getByText("Đã duyệt đơn và phát hành trò chơi."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await login(fixture.buyer, "/store");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await login(fixture.developer, "/manage-games");
  await card.getByRole("button", { name: `Sửa ${title}` }).click();
  await page
    .getByLabel("Mô tả trò chơi")
    .fill("Updated content must be reviewed again");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Đăng tải trò chơi", exact: true }),
  ).toBeEnabled();
  await expect(
    card.getByRole("button", { name: "Bật lại trò chơi" }),
  ).toHaveCount(0);
  await card.getByRole("button", { name: "Chi tiết", exact: true }).click();
  await expect(page.getByText("Lý do: Trò chơi đã bị chỉnh sửa")).toBeVisible();
  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await login(fixture.buyer, "/store");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
});
