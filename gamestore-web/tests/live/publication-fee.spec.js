import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { confirmTopUpQr } from "../helpers/topup.js";

test("free publication confirms 1.3m VND, debits once, and appears in scoped fee reports", async ({
  page,
  request,
}) => {
  const fixture = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  await page.goto("/login");
  await page
    .getByPlaceholder("Nhập username hoặc email...")
    .fill(fixture.developer.username);
  await page.getByPlaceholder("••••••••").fill(fixture.developer.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/store/);
  const token = await page.evaluate(() =>
    localStorage.getItem("steam_jwt_token"),
  );
  const headers = { Authorization: `Bearer ${token}` };
  const management = await (
    await request.get(`${fixture.api}/catalog/manage`, { headers })
  ).json();
  const title = `Free release ${Date.now()}`;
  const created = await request.post(`${fixture.api}/catalog/games`, {
    headers,
    data: {
      title,
      price: "0",
      genre_ids: [management.genres[0].id],
      description: "Publication fee test",
      version: "1.0",
    },
  });
  expect(created.status()).toBe(201);
  const game = await created.json();
  await page.goto("/manage-games");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card
    .getByRole("button", { name: "Đăng tải trò chơi", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("1.300.000");
  await expect(page.getByRole("dialog")).toContainText("50 USD");
  await expect(
    page.getByRole("button", { name: "Xác nhận gửi đơn" }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Nạp tiền vào ví" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill("2000000");
  await page.getByRole("button", { name: "Tiếp tục nạp tiền" }).click();
  await confirmTopUpQr(page);
  await page.goto("/manage-games");
  await card
    .getByRole("button", { name: "Đăng tải trò chơi", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận gửi đơn" }).click();
  await expect(
    card.getByRole("button", { name: "Đang chờ duyệt" }),
  ).toBeDisabled();
  const state = await (
    await request.get(`${fixture.api}/commerce/state`, { headers })
  ).json();
  expect(state.current_user.balance).toBe("700000.00");
  expect(
    state.transactions.filter(
      (t) => t.type === "OUT" && t.amount === "1300000.00",
    ),
  ).toHaveLength(1);
  const replay = await request.post(
    `${fixture.api}/catalog/games/${game.id}/submissions`,
    { headers, data: { expected_fee: "1300000" } },
  );
  expect(replay.status()).toBe(409);
  await page.goto("/developer/revenue");
  await expect(
    page.getByRole("cell", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /1.300.000/ })).toBeVisible();
  await page.screenshot({
    path: "output/playwright/free-publication-fee.png",
    fullPage: true,
  });
});
