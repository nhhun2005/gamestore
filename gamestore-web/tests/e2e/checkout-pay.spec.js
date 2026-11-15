import { test, expect } from "@playwright/test";
const user = {
  id: "77000000-0000-4000-8000-000000000001",
  username: "checkout-player",
  role: "USER",
  balance: "0.00",
  status: "VERIFIED",
};
const id = "77000000-0000-4000-8000-000000000002";
async function setup(page, missing = false) {
  const now = Date.now();
  await page.clock.install({ time: now });
  const token = `e30.${Buffer.from(JSON.stringify({ id: user.id, sub: user.username, role: user.role, exp: Math.floor(now / 1000) + 3600 })).toString("base64url")}.test`;
  await page.addInitScript(
    (token) => localStorage.setItem("steam_jwt_token", token),
    token,
  );
  let reads = 0;
  let expired = false;
  const confirms = [];
  await page.route("**/api/commerce/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/commerce",
      "",
    );
    if (path === "/state")
      return route.fulfill({
        json: {
          current_user: user,
          users: [],
          games: [],
          promotions: [],
          transactions: [],
          game_bought: [],
          reviews: [],
          wishlist: [],
          checkout_sessions: [],
          capabilities: { sandbox_payments: true },
          library: { collections: [], memberships: [], preferences: [] },
        },
      });
    if (path === "/notifications")
      return route.fulfill({ json: { items: [], unread_count: 0 } });
    if (path === `/checkouts/${id}`) {
      reads++;
      if (missing)
        return route.fulfill({
          status: 404,
          json: { message: "Không tìm thấy đơn thanh toán." },
        });
      return route.fulfill({
        json: {
          id,
          game_id: id,
          transaction_id: id,
          game_title: "Checkout timer",
          amount: "120000.00",
          status: expired ? "EXPIRED" : "PENDING",
          expires_at: new Date(now + 60000).toISOString(),
          created_at: new Date(now).toISOString(),
          qr_payload: `gamestore-pay://checkout/${id}?code=${id}`,
        },
      });
    }
    confirms.push(path);
    return route.fulfill({
      status: 500,
      json: { message: "Unexpected mutation" },
    });
  });
  return {
    confirms,
    reads: () => reads,
    expire: () => {
      expired = true;
    },
  };
}
test("checkout countdown asks backend to expire the order and cannot display a forged success", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto(`/checkout/${id}?status=SUCCESSED`);
  await expect(
    page.getByRole("heading", { name: "Chọn phương thức thanh toán" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Thanh toán thành công", exact: true }),
  ).toHaveCount(0);
  f.expire();
  await page.clock.runFor(61000);
  await expect(
    page.getByRole("heading", {
      name: "Đơn thanh toán đã hết hạn",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Thanh toán 120/ }),
  ).toHaveCount(0);
  expect(f.reads()).toBeGreaterThan(1);
  expect(f.confirms).toEqual([]);
});
test("missing or foreign checkout shows a recoverable error with no payment controls", async ({
  page,
}) => {
  await setup(page, true);
  await page.goto(`/checkout/${id}`);
  await expect(page.getByRole("alert")).toHaveText(
    "Không tìm thấy đơn thanh toán.",
  );
  await expect(
    page.getByRole("button", { name: "Thử lại", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dùng thẻ thành công" }),
  ).toHaveCount(0);
});
