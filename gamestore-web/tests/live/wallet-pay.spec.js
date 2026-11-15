import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("wallet top-up opens GameStore Pay instead of the old dialog and credits exactly once", async ({
  page,
  request,
}) => {
  const f = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  await page.goto("/login");
  await page
    .getByPlaceholder("Nhập username hoặc email...")
    .fill(f.payUser.username);
  await page.getByPlaceholder("••••••••").fill(f.payUser.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/store/);
  const token = await page.evaluate(() =>
    localStorage.getItem("steam_jwt_token"),
  );
  const headers = { Authorization: `Bearer ${token}` };
  const before = await (
    await request.get(`${f.api}/commerce/wallet`, { headers })
  ).json();
  await page.goto("/wallet");
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill("500000");
  await page
    .getByRole("button", { name: "Tiếp tục nạp tiền", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", {
      name: "Chọn phương thức nạp tiền",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Dùng thẻ bị từ chối", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Thanh toán 500.000 ₫", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Thanh toán không thành công",
      exact: true,
    }),
  ).toBeVisible();
  const declined = await (
    await request.get(`${f.api}/commerce/wallet`, { headers })
  ).json();
  expect(declined.balance).toBe(before.balance);
  await page.getByRole("link", { name: "Quay lại ví", exact: true }).click();
  await page
    .getByRole("button", { name: "Tiếp tục nạp tiền", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Chọn phương thức nạp tiền",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dùng thẻ thành công", exact: true })
    .click();
  await page.screenshot({
    path: "output/playwright/wallet-gamestore-pay.png",
    fullPage: true,
  });
  const id = new URL(page.url()).pathname.split("/").pop();
  await page
    .getByRole("button", { name: "Thanh toán 500.000 ₫", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nạp tiền thành công", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Nạp tiền thành công", exact: true }),
  ).toBeVisible();
  const replay = await request.post(
    `${f.api}/commerce/checkouts/${id}/confirm`,
    {
      headers,
      data: {
        method: "CARD",
        bank: "NCB",
        card_number: "4242424242424242",
        expiry: "12/35",
        cvv: "123",
      },
    },
  );
  expect(replay.status()).toBe(200);
  const after = await (
    await request.get(`${f.api}/commerce/wallet`, { headers })
  ).json();
  expect(Number(after.balance)).toBe(Number(before.balance) + 500000);
  await page.getByRole("link", { name: "Về ví của tôi", exact: true }).click();
  await expect(page).toHaveURL(/wallet$/);
  await expect(page.getByRole("heading", { name: /500.000/ })).toBeVisible();
});

test("pending topup resumes from wallet/history and synchronizes when another tab pays", async ({
  page,
  context,
  request,
}) => {
  const f = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  await page.goto("/login");
  await page
    .getByPlaceholder("Nhập username hoặc email...")
    .fill(f.payUser.username);
  await page.getByPlaceholder("••••••••").fill(f.payUser.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/store/);
  const token = await page.evaluate(() =>
    localStorage.getItem("steam_jwt_token"),
  );
  const headers = { Authorization: `Bearer ${token}` };
  const before = await (
    await request.get(`${f.api}/commerce/wallet`, { headers })
  ).json();
  await page.goto("/wallet");
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill("100000");
  await page
    .getByRole("button", { name: "Tiếp tục nạp tiền", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Chọn phương thức nạp tiền",
      exact: true,
    }),
  ).toBeVisible();
  const checkoutUrl = page.url();
  const id = new URL(checkoutUrl).pathname.split("/").pop();
  const payment = await (
    await request.get(`${f.api}/commerce/checkouts/${id}`, { headers })
  ).json();
  await page.getByRole("link", { name: "Quay lại ví", exact: true }).click();
  const pending = page.getByRole("region", {
    name: "Đơn nạp tiền đang chờ",
    exact: true,
  });
  await expect(pending).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByText(payment.transaction_id.slice(0, 8), { exact: true }),
    });
  await expect(row.getByText("Chờ thanh toán", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("cell", { name: "100.000 ₫", exact: true }),
  ).toBeVisible();
  await row
    .getByRole("link", { name: "Tiếp tục thanh toán", exact: true })
    .click();
  await expect(page).toHaveURL(checkoutUrl);
  const second = await context.newPage();
  await second.goto(checkoutUrl);
  await second
    .getByRole("button", { name: "Dùng thẻ thành công", exact: true })
    .click();
  await second
    .getByRole("button", { name: "Thanh toán 100.000 ₫", exact: true })
    .click();
  await expect(
    second.getByRole("heading", { name: "Nạp tiền thành công", exact: true }),
  ).toBeVisible();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "Nạp tiền thành công", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Về ví của tôi", exact: true }).click();
  const after = await (
    await request.get(`${f.api}/commerce/wallet`, { headers })
  ).json();
  expect(Number(after.balance)).toBe(Number(before.balance) + 100000);
  await expect(
    page.getByRole("region", { name: "Đơn nạp tiền đang chờ", exact: true }),
  ).toHaveCount(0);
  await second.close();
});
