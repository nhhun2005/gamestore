import { test, expect } from "@playwright/test";
import { createCommerceService } from "../../src/services/commerceService.js";

const pixel = "Pixel Valley Farming";
async function demo(page, name = "Huỳnh") {
  await page.goto("/demo");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/store/);
}
async function topUp(page, amount = "500000") {
  await page.goto("/wallet");
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill(amount);
  await page.getByRole("button", { name: "Tiếp tục nạp tiền" }).click();
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function details(page, title) {
  await page.goto("/store");
  await page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .getByRole("button", { name: "Xem chi tiết" })
    .click();
}
async function purchase(page, title) {
  await details(page, title);
  await page.getByRole("button", { name: "Xác nhận mua game" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã thêm vào thư viện" }),
  ).toBeVisible();
}
test("all seven use cases: consistent wallet, library, reviews, history and scoped revenue", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/login/);
  await page
    .getByRole("link", { name: "Thử Demo khi backend chưa sẵn sàng →" })
    .click();
  await page.getByRole("button", { name: /Huỳnh/ }).click();
  await page.waitForFunction(() =>
    [...document.images].every((img) => img.complete),
  );
  await page.screenshot({
    path: "output/playwright/store-desktop.png",
    fullPage: true,
  });
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Thư viện đang trống" }),
  ).toBeVisible();
  await page.goto("/transactions");
  await expect(
    page.getByRole("heading", { name: "Chưa có giao dịch phù hợp" }),
  ).toBeVisible();
  await topUp(page);
  await expect(page.getByRole("heading", { name: /600.000/ })).toBeVisible();
  await purchase(page, pixel);
  await page.getByRole("link", { name: "Mở thư viện", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: pixel, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Viết đánh giá" }).click();
  await page.getByLabel("Điểm đánh giá").selectOption("4.5");
  await page.getByLabel("Chia sẻ trải nghiệm").fill("Một thung lũng đáng nhớ.");
  await page.getByRole("button", { name: "Lưu đánh giá" }).click();
  await expect(page.getByText("4.5 / 5 · 1 đánh giá")).toBeVisible();
  await page.getByRole("button", { name: "Sửa đánh giá" }).click();
  await page.getByLabel("Điểm đánh giá").selectOption("3.5");
  await page.getByLabel("Chia sẻ trải nghiệm").fill("Đã cập nhật trải nghiệm.");
  await page.getByRole("button", { name: "Lưu đánh giá" }).click();
  await expect(page.getByText("3.5 / 5 · 1 đánh giá")).toBeVisible();
  await page.getByRole("button", { name: "Xóa đánh giá", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(
    page.getByText("Chưa có đánh giá", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: pixel, exact: true }),
  ).toBeVisible();
  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: /435.000/ })).toBeVisible();
  await page.goto("/transactions");
  await expect(
    page.getByRole("cell", { name: pixel, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Loại giao dịch" })
    .selectOption("IN");
  await expect(
    page.getByRole("cell", { name: pixel, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Trạng thái" })
    .selectOption("FAILED");
  await expect(
    page.getByRole("heading", { name: "Chưa có giao dịch phù hợp" }),
  ).toBeVisible();
  await page.goto("/admin/revenue");
  await expect(
    page.getByRole("heading", { name: "Không có quyền truy cập" }),
  ).toBeVisible();
  await topUp(page, "1000000");
  await purchase(page, "Elden Chronicles");
  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await demo(page, "Aurora Studio");
  await page.goto("/developer/revenue");
  await expect(page.getByRole("heading", { name: /165.000/ })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Elden Chronicles" }),
  ).toHaveCount(0);
  await page.goto("/manage-games");
  await expect(
    page.getByRole("heading", { name: "Quản lý trò chơi", level: 1 }),
  ).toBeVisible();
  await page.goto("/admin/revenue");
  await expect(
    page.getByRole("heading", { name: "Không có quyền truy cập" }),
  ).toBeVisible();
  await demo(page, "Administrator");
  await page.goto("/admin/revenue");
  await expect(page.getByRole("heading", { name: /1.015.000/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ember Games" })).toBeVisible();
  await page.screenshot({
    path: "output/playwright/revenue-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Từ ngày").fill("2099-01-01");
  await expect(
    page.getByRole("heading", {
      name: "Chưa có lượt mua trong khoảng thời gian này",
    }),
  ).toBeVisible();
  await page.getByLabel("Đến ngày").fill("2020-01-01");
  await expect(page.getByRole("alert")).toHaveText(
    "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.",
  );
  expect(errors).toEqual([]);
});
test("mobile, validation, insufficient funds, free/duplicate/unavailable purchase, history and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page);
  await page.goto("/wallet");
  await page.getByLabel("Số tiền tùy chỉnh (VND)").fill("-1");
  await expect(
    page.getByRole("button", { name: "Tiếp tục nạp tiền" }),
  ).toBeDisabled();
  await details(page, pixel);
  await expect(page.getByText("Số dư không đủ để mua trò chơi.")).toBeVisible();
  await page.keyboard.press("Escape");
  await details(page, "Dự án sắp ra mắt");
  await expect(page.getByText("Trò chơi hiện chưa mở bán.")).toBeVisible();
  await page.keyboard.press("Escape");
  await details(page, "Celeste");
  await page
    .getByRole("button", { name: "Thêm miễn phí vào thư viện" })
    .click();
  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await details(page, "Celeste");
  await expect(page.getByText("Bạn đã sở hữu trò chơi này.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", { name: "Thư viện (Library)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Celeste", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/store/);
  await page.goForward();
  await expect(page).toHaveURL(/library/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/library-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đặt lại dữ liệu" }).click();
  await page.getByRole("button", { name: "Xác nhận đặt lại" }).click();
  await expect(
    page.getByRole("heading", { name: "Thư viện đang trống" }),
  ).toBeVisible();
});

function authData(role = "USER", seconds = 3600) {
  const claims = {
    id: "99000000-0000-4000-8000-000000000001",
    sub: "existing_player",
    email: "player@example.com",
    role,
    exp: Math.floor(Date.now() / 1000) + seconds,
  };
  return {
    token: `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test-signature`,
    id: claims.id,
    username: claims.sub,
    role,
    email: claims.email,
  };
}
async function interceptAuth(page, data, status = 200, topups = true) {
  await page.route("http://localhost:8080/api/auth/**", (route) =>
    route.fulfill({
      status,
      json: data,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  if (status !== 200) return;
  const commerce = createCommerceService({
    currentUser: () => ({
      id: data.id,
      username: data.username,
      role: data.role,
    }),
    delay: 0,
  });
  await commerce.prepareAccount();
  await page.route("http://localhost:8080/api/commerce/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    try {
      let body;
      if (path.endsWith("/state")) {
        const snapshot = commerce.snapshot();
        body = {
          ...snapshot,
          current_user: snapshot.users.find((u) => u.id === data.id),
          users: snapshot.users.map(({ id, username, role }) => ({
            id,
            username,
            role,
          })),
          capabilities: { demo_topups: topups },
        };
      } else if (path.endsWith("/wallet/demo-topups"))
        body = await commerce.topUp(route.request().postDataJSON().amount);
      else if (path.endsWith("/purchases"))
        body = await commerce.purchase(route.request().postDataJSON().game_id);
      else if (path.endsWith("/revenue")) body = await commerce.revenue();
      else
        return route.fulfill({
          status: 404,
          json: { message: "Test fixture endpoint missing" },
        });
      return route.fulfill({
        status: 200,
        json: body,
        headers: { "access-control-allow-origin": "*" },
      });
    } catch (error) {
      return route.fulfill({
        status: 400,
        json: { message: error.message },
        headers: { "access-control-allow-origin": "*" },
      });
    }
  });
}
async function login(page) {
  await page
    .getByPlaceholder("Nhập username hoặc email...")
    .fill("existing_player");
  await page.getByPlaceholder("••••••••").fill("password123");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}
test("existing JWT login returns to requested page, commerce survives reload/logout/sign-in", async ({
  page,
}) => {
  const data = authData();
  await interceptAuth(page, data);
  await page.goto("/wallet");
  await expect(page).toHaveURL(/login/);
  await expect(page.locator("header")).toHaveCount(0);
  await login(page);
  await expect(page).toHaveURL(/wallet/);
  expect(
    await page.evaluate(() => localStorage.getItem("steam_jwt_token")),
  ).toBe(data.token);
  await topUp(page);
  await expect(page.getByRole("heading", { name: /600.000/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /600.000/ })).toBeVisible();
  await purchase(page, pixel);
  await page.getByRole("link", { name: "Mở thư viện" }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/login/);
  expect(
    await page.evaluate(() => localStorage.getItem("steam_jwt_token")),
  ).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/login/);
  await login(page);
  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: pixel, exact: true }),
  ).toBeVisible();
  await page.goto("/demo");
  await expect(page).toHaveURL(/store/);
});
test("existing registration, role navigation, expired and invalid login responses", async ({
  page,
}) => {
  await interceptAuth(page, authData("ADMINISTRATOR"));
  await page.goto("/login");
  await page.getByText("Tạo một tài khoản miễn phí", { exact: true }).click();
  await expect(page).toHaveURL(/register/);
  await page.getByPlaceholder("Ví dụ: player_one").fill("existing_player");
  await page.getByPlaceholder("name@example.com").fill("player@example.com");
  await page.getByPlaceholder("Tối thiểu 6 ký tự").fill("password123");
  await page.getByPlaceholder("Nhập lại mật khẩu").fill("password123");
  await page.getByRole("button", { name: "Hoàn tất đăng ký" }).click();
  await expect(page).toHaveURL(/store/);
  await page.getByRole("link", { name: "Quản lý người dùng" }).click();
  await expect(
    page.getByRole("heading", { name: /Quản lý Người dùng/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Quản lý trò chơi", exact: true })).toHaveCount(1);
  await page.evaluate(
    (token) => localStorage.setItem("steam_jwt_token", token),
    authData("USER", -1).token,
  );
  await page.reload();
  await expect(page).toHaveURL(/login/);
  expect(
    await page.evaluate(() => localStorage.getItem("steam_jwt_token")),
  ).toBeNull();
  await interceptAuth(page, { message: "Sai tài khoản hoặc mật khẩu." }, 401);
  await login(page);
  await expect(page.getByText("Sai tài khoản hoặc mật khẩu.")).toBeVisible();
});
test("production preserves real login and excludes demo and mock mutations", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173/login");
  await expect(
    page.getByRole("heading", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Thử Demo/ })).toHaveCount(0);
  await page.goto("http://127.0.0.1:4173/demo");
  await expect(
    page.getByRole("heading", { name: "Trải nghiệm Demo" }),
  ).toHaveCount(0);
  await interceptAuth(page, authData(), 200, false);
  await page.goto("http://127.0.0.1:4173/login");
  await login(page);
  await expect(page).toHaveURL(/store/);
  await page.getByRole("link", { name: "Ví", exact: true }).click();
  await expect(page.getByRole("heading", { name: /100.000/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tiếp tục nạp tiền" }),
  ).toBeDisabled();
});
