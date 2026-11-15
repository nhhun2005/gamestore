import { test, expect } from "@playwright/test";
const id = "99000000-1000-4000-8000-000000000001";
const receipt = "99000000-1000-4000-8000-000000000002";
const user = {
  id: "99000000-1000-4000-8000-000000000003",
  username: "resume-player",
  role: "USER",
  status: "VERIFIED",
};
async function setup(page) {
  const now = Date.now();
  await page.clock.install({ time: now });
  const token = `e30.${Buffer.from(JSON.stringify({ id: user.id, sub: user.username, role: "USER", exp: Math.floor(now / 1000) + 3600 })).toString("base64url")}.test`;
  await page.addInitScript(
    (token) => localStorage.setItem("steam_jwt_token", token),
    token,
  );
  let status = "PENDING";
  const payment = () => ({
    id,
    transaction_id: receipt,
    game_id: null,
    game_title: "Nạp tiền vào ví GameStore",
    amount: "500000.00",
    status,
    purpose: "TOPUP",
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 600000).toISOString(),
    qr_payload: `gamestore-pay://checkout/${id}?code=${id}`,
  });
  await page.route("**/api/commerce/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/commerce",
      "",
    );
    if (path === "/state")
      return route.fulfill({
        json: {
          current_user: {
            ...user,
            balance: status === "SUCCESSED" ? "500000.00" : "0.00",
          },
          users: [],
          games: [],
          promotions: [],
          reviews: [],
          wishlist: [],
          game_bought: [],
          checkout_sessions: [payment()],
          library: { collections: [], memberships: [], preferences: [] },
          capabilities: {
            demo_topups: true,
            sandbox_payments: true,
            sandbox_topups: true,
          },
          transactions: [
            {
              id: receipt,
              user_id: user.id,
              game_id: null,
              type: "IN",
              amount: "500000.00",
              status:
                status === "PENDING"
                  ? "PENDING"
                  : status === "SUCCESSED"
                    ? "SUCCESSED"
                    : "FAILED",
              created_at: new Date(now).toISOString(),
            },
          ],
        },
      });
    if (path === "/notifications")
      return route.fulfill({ json: { items: [], unread_count: 0 } });
    if (path === `/checkouts/${id}`) return route.fulfill({ json: payment() });
    if (path === `/checkouts/${id}/cancel`) {
      status = "CANCELLED";
      return route.fulfill({ json: payment() });
    }
    return route.fulfill({ status: 404, json: { message: "Unknown request" } });
  });
  return {
    setStatus(value) {
      status = value;
    },
  };
}
test("wallet has resume/cancel actions and refocus updates a payment completed elsewhere", async ({
  page,
}) => {
  const server = await setup(page);
  await page.goto("/wallet");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText(receipt.slice(0, 8), { exact: true }) });
  await expect(row.getByText("Chờ thanh toán", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("cell", { name: "500.000 ₫", exact: true }),
  ).toBeVisible();
  await row
    .getByRole("link", { name: "Tiếp tục thanh toán", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${id}$`));
  await expect(
    page.getByRole("heading", {
      name: "Chọn phương thức nạp tiền",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Quay lại ví", exact: true }).click();
  server.setStatus("SUCCESSED");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(row.getByText("Thành công", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("link", { name: "Xem biên nhận", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Đơn nạp tiền đang chờ", exact: true }),
  ).toHaveCount(0);
});
test("abandoned payment expires while user remains in wallet and is never shown as credited", async ({
  page,
}) => {
  const server = await setup(page);
  await page.goto("/wallet");
  await expect(
    page.getByRole("region", { name: "Đơn nạp tiền đang chờ", exact: true }),
  ).toBeVisible();
  server.setStatus("EXPIRED");
  await page.clock.runFor(16000);
  await expect(page.getByText("Hết hạn", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Đơn nạp tiền đang chờ", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "0 ₫", exact: true }),
  ).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText(receipt.slice(0, 8), { exact: true }) });
  await expect(
    row.getByRole("cell", { name: "500.000 ₫", exact: true }),
  ).toBeVisible();
});
