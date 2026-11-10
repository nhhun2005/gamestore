import { test, expect } from "@playwright/test";
import { readTopUpCode } from "../helpers/topup.js";

async function demoWallet(page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Huỳnh/ }).click();
  await page.getByRole("link", { name: "Ví", exact: true }).click();
}
async function openQr(page, amount = "250000") {
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill(amount);
  await page.getByRole("button", { name: "Tiếp tục nạp tiền" }).click();
  return readTopUpCode(page);
}

test("real QR decodes to a code; only the correct entered code credits the demo wallet", async ({ page }) => {
  await demoWallet(page);
  const code = await openQr(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("250.000");
  await expect(dialog).not.toContainText(code);
  await expect(page.getByRole("heading", { name: /100.000/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận nạp", exact: true })).toBeDisabled();
  await page.screenshot({ path: "output/playwright/wallet-qr-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/wallet-qr-mobile.png", fullPage: true });
  await page.getByLabel("Mã xác nhận", { exact: true }).fill("GS-WRONG-CODE");
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Mã xác nhận không đúng");
  await expect(page.getByRole("heading", { name: /100.000/ })).toBeVisible();
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /350.000/ })).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Nạp tiền IN", exact: true }) })).toHaveCount(1);
});

test("regenerating QR invalidates the old code; closing QR never credits the wallet", async ({ page }) => {
  await demoWallet(page);
  const oldCode = await openQr(page, "100000");
  await page.getByRole("button", { name: "Tạo QR mới", exact: true }).click();
  await expect.poll(() => readTopUpCode(page)).not.toBe(oldCode);
  const newCode = await readTopUpCode(page);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(oldCode);
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Mã xác nhận không đúng");
  await page.getByRole("button", { name: "Đóng hộp thoại", exact: true }).click();
  await expect(page.getByRole("heading", { name: /100.000/ })).toBeVisible();
  const thirdCode = await openQr(page, "200000");
  expect(thirdCode).not.toBe(newCode);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(thirdCode);
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(page.getByRole("heading", { name: /300.000/ })).toBeVisible();
});

test("expired QR disables confirmation and a new QR can be generated", async ({ page }) => {
  await demoWallet(page);
  const code = await openQr(page);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(code);
  await page.clock.setFixedTime(Date.now() + 601000);
  await expect(page.getByRole("dialog")).toContainText("hết hạn");
  await expect(page.getByRole("button", { name: "Xác nhận nạp", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Tạo QR mới", exact: true }).click();
  await expect.poll(() => readTopUpCode(page)).not.toBe(code);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(await readTopUpCode(page));
  await expect(page.getByRole("button", { name: "Xác nhận nạp", exact: true })).toBeEnabled();
});

async function jwtWallet(page) {
  const user = { id: "11111111-1111-4111-8111-111111111111", username: "Player", role: "USER", status: "VERIFIED", balance: "100000.00" };
  const token = `e30.${Buffer.from(JSON.stringify({ id: user.id, sub: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await page.addInitScript((value) => localStorage.setItem("steam_jwt_token", value), token);
  const calls = { challenges: [], confirmations: [], challengeFailure: true, enabled: true };
  await page.route("**/api/commerce/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith("/state")) return route.fulfill({ json: { current_user: user, users: [], games: [], game_bought: [], reviews: [], transactions: [], promotions: [], wishlist: [], capabilities: { demo_topups: calls.enabled } } });
    if (path.endsWith("/notifications")) return route.fulfill({ json: { items: [], unread_count: 0 } });
    if (path.endsWith("/challenges")) {
      calls.challenges.push(request.postDataJSON());
      if (calls.challengeFailure) return route.fulfill({ status: 503, json: { message: "Không tạo được yêu cầu QR." } });
      return route.fulfill({ status: 201, json: { challenge_id: "22222222-2222-4222-8222-222222222222", code: "GS-ABCD-EFGH", amount: "100000.00", expires_at: new Date(Date.now() + 600000).toISOString() } });
    }
    if (path.endsWith("/demo-topups")) {
      calls.confirmations.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
      return route.fulfill({ status: 400, json: { message: "Mã xác nhận không đúng. Vui lòng thử lại." } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  return calls;
}

test("server generation/confirmation failures have retry and never show fake credit", async ({ page }) => {
  const calls = await jwtWallet(page);
  await page.goto("/wallet");
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill("100000");
  await page.getByRole("button", { name: "Tiếp tục nạp tiền" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Không tạo được yêu cầu QR.");
  calls.challengeFailure = false;
  await page.getByRole("button", { name: /Thử lại|Tạo QR mới/ }).click();
  const code = await readTopUpCode(page);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Mã xác nhận không đúng");
  expect(calls.confirmations).toEqual([{ key: "22222222-2222-4222-8222-222222222222", body: { amount: "100000.00", challenge_id: "22222222-2222-4222-8222-222222222222", code } }]);
  await expect(page.getByRole("heading", { name: /100.000/ })).toBeVisible();
});

test("disabled server capability prevents generating any top-up request", async ({ page }) => {
  const calls = await jwtWallet(page); calls.enabled = false;
  await page.goto("/wallet");
  await expect(page.getByRole("button", { name: "Tiếp tục nạp tiền" })).toBeDisabled();
  expect(calls.challenges).toHaveLength(0);
});
