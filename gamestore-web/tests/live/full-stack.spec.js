import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { money } from "../../src/services/currency.js";

test("real browser → JWT API → PostgreSQL: deposit, discounted purchase, review, persistence and revenue", async ({
  page,
}) => {
  const fixture = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function login(account) {
    await page.goto("/login");
    await page
      .getByPlaceholder("Nhập username hoặc email...")
      .fill(account.username);
    await page.getByPlaceholder("••••••••").fill(account.password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/store/);
  }
  async function buy(game) {
    await page.goto("/store");
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", { name: game.title, exact: true }),
      })
      .getByRole("button", { name: "Xem chi tiết" })
      .click();
    await page.getByRole("button", { name: "Xác nhận mua game" }).click();
    await expect(
      page.getByRole("heading", { name: "Đã thêm vào thư viện" }),
    ).toBeVisible();
  }
  await login(fixture.buyer);
  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: money("0") })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục nạp tiền" }).click();
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(page.getByRole("heading", { name: /500.000/ })).toBeVisible();
  await buy(fixture.garden);
  await page.getByRole("link", { name: "Mở thư viện", exact: true }).click();
  await page.getByRole("button", { name: "Viết đánh giá" }).click();
  await page.getByLabel("Điểm đánh giá").selectOption("4.5");
  await page
    .getByLabel("Chia sẻ trải nghiệm")
    .fill("Đánh giá được lưu vào PostgreSQL thật.");
  await page.getByRole("button", { name: "Lưu đánh giá" }).click();
  await expect(page.getByText("4.5 / 5 · 1 đánh giá")).toBeVisible();
  await page.getByRole("button", { name: "Sửa đánh giá" }).click();
  await page.getByLabel("Điểm đánh giá").selectOption("3.5");
  await page.getByRole("button", { name: "Lưu đánh giá" }).click();
  await expect(page.getByText("3.5 / 5 · 1 đánh giá")).toBeVisible();
  await page.getByRole("button", { name: "Xóa đánh giá", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(
    page.getByText("Chưa có đánh giá", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: fixture.garden.title, exact: true }),
  ).toBeVisible();
  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: /350.000/ })).toBeVisible();
  await page.screenshot({
    path: "output/playwright-live/wallet-database.png",
    fullPage: true,
  });
  await page.goto("/transactions");
  await expect(
    page.getByRole("cell", { name: fixture.garden.title }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /150.000/ })).toBeVisible();
  await buy(fixture.adventure);
  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await login(fixture.developer);
  await page.goto("/developer/revenue");
  await expect(page.getByRole("heading", { name: /150.000/ })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: fixture.garden.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: fixture.adventure.title }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await login(fixture.admin);
  await page.goto("/admin/revenue");
  await expect(
    page.getByRole("cell", { name: fixture.adventure.title }),
  ).toBeVisible();
  const token = await page.evaluate(() =>
    localStorage.getItem("steam_jwt_token"),
  );
  const rows = await (
    await page.request.get(`${fixture.api}/commerce/revenue`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  await expect(page.getByRole("heading", { name: money(total) })).toBeVisible();
  expect(
    rows.every((row) => row.type === "BUY" && row.status === "SUCCESSED"),
  ).toBe(true);
  expect(errors).toEqual([]);
});
