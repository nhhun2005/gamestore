import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import jsQR from "jsqr";
import { PNG } from "pngjs";

async function setup(page) {
  const fixture = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  await page.goto("/login");
  await page
    .getByPlaceholder("Nhập username hoặc email...")
    .fill(fixture.payUser.username);
  await page.getByPlaceholder("••••••••").fill(fixture.payUser.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/store/);
  return fixture;
}
async function open(page, game) {
  await page.goto(`/games/${game.id}`);
  await page.getByRole("button", { name: "Mua game", exact: true }).click();
  await page
    .getByRole("button", { name: "Thanh toán qua GameStore Pay", exact: true })
    .click();
  await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Chọn phương thức thanh toán" }),
  ).toBeVisible();
}
test("GameStore Pay card decline, resume, cancellation and successful receipt persist through real backend", async ({
  page,
  request,
}) => {
  const f = await setup(page);
  await open(page, f.payGame);
  const firstUrl = page.url();
  await expect(
    page.getByText("249.000", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dùng thẻ bị từ chối", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Thanh toán 249.000 ₫", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Thanh toán không thành công",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Thanh toán không thành công",
      exact: true,
    }),
  ).toBeVisible();
  await open(page, f.payGame);
  expect(page.url()).not.toBe(firstUrl);
  const pendingUrl = page.url();
  await page.goto("/transactions");
  await page
    .getByRole("region", { name: "Đơn GameStore Pay đang chờ", exact: true })
    .getByRole("link", { name: "Tiếp tục thanh toán", exact: true })
    .click();
  await expect(page).toHaveURL(pendingUrl);
  await page
    .getByRole("button", { name: "Hủy thanh toán", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Đã hủy thanh toán", exact: true }),
  ).toBeVisible();
  await open(page, f.payGame);
  await page.getByRole("radio", { name: "Vietcombank", exact: true }).check();
  await page
    .getByRole("button", { name: "Dùng thẻ thành công", exact: true })
    .click();
  await expect(page.getByLabel("Số thẻ", { exact: true })).toHaveValue(
    "4242424242424242",
  );
  await page.screenshot({
    path: "output/playwright/gamestore-pay-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Thanh toán 249.000 ₫", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("•••• 4242", { exact: true })).toBeVisible();
  await expect(page.getByText("VIETCOMBANK", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "output/playwright/gamestore-pay-receipt.png",
    fullPage: true,
  });
  const token = await page.evaluate(() =>
    localStorage.getItem("steam_jwt_token"),
  );
  const state = await (
    await request.get(`${f.api}/commerce/state`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  expect(state.current_user.balance).toBe("0.00");
  expect(
    state.game_bought.filter((p) => p.game_id === f.payGame.id),
  ).toHaveLength(1);
  expect(
    state.transactions.filter(
      (t) => t.game_id === f.payGame.id && t.status === "SUCCESSED",
    ),
  ).toHaveLength(1);
  await page.getByRole("link", { name: "Mở thư viện", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: f.payGame.title, exact: true }),
  ).toBeVisible();
});

test("GameStore Pay QR decodes to an order-specific code and mobile checkout confirms once", async ({
  page,
  request,
}) => {
  const f = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, f.payQrGame);
  await page.getByRole("button", { name: "Quét mã QR", exact: true }).click();
  await page.getByRole("radio", { name: "BIDV", exact: true }).check();
  const qr = page.getByRole("img", {
    name: "QR thanh toán GameStore Pay",
    exact: true,
  });
  await expect(qr).toBeVisible();
  const source = await qr.getAttribute("src");
  const png = PNG.sync.read(Buffer.from(source.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded).not.toBeNull();
  const payload = new URL(decoded.data);
  expect(payload.protocol).toBe("gamestore-pay:");
  const code = payload.searchParams.get("code");
  await page
    .getByLabel("Mã xác nhận QR", { exact: true })
    .fill("00000000-0000-0000-0000-000000000000");
  await page
    .getByRole("button", { name: "Xác nhận thanh toán 129.000 ₫", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Mã xác nhận QR không đúng",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "output/playwright/gamestore-pay-qr-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Mã xác nhận QR", { exact: true }).fill(code);
  await page
    .getByRole("button", { name: "Xác nhận thanh toán 129.000 ₫", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(() =>
    localStorage.getItem("steam_jwt_token"),
  );
  const state = await (
    await request.get(`${f.api}/commerce/state`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  expect(
    state.game_bought.filter((p) => p.game_id === f.payQrGame.id),
  ).toHaveLength(1);
});
