import { test, expect } from "@playwright/test";

const applicantId = "11111111-1111-4111-8111-111111111111";
async function setup(page, role = "USER") {
  const account = { id: role === "ADMINISTRATOR" ? "22222222-2222-4222-8222-222222222222" : applicantId, username: role === "ADMINISTRATOR" ? "Admin" : "Studio", role, status: "VERIFIED", balance: "0.00" };
  const state = { account, submissions: [], writes: [], reads: [], loadError: false, writeError: false };
  const token = `e30.${Buffer.from(JSON.stringify({ id: account.id, sub: account.username, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  await page.addInitScript((jwt) => localStorage.setItem("steam_jwt_token", jwt), token);
  await page.route("**/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === "/api/commerce/state") return route.fulfill({ json: { current_user: state.account, users: [], games: [], promotions: [], transactions: [], game_bought: [], reviews: [], wishlist: [], capabilities: {} } });
    if (path === "/api/commerce/notifications") return route.fulfill({ json: { items: [], unread_count: 0 } });
    if (!path.startsWith("/api/developer/")) return route.fulfill({ status: 404, json: { message: "Không tìm thấy." } });
    if (request.method() === "GET") {
      state.reads.push(url.search);
      if (state.loadError) return route.fulfill({ status: 503, json: { message: "Không tải được đơn đăng ký." } });
      if (!path.includes("/admin/")) return route.fulfill({ json: state.submissions.filter((s) => s.user_id === account.id) });
      const status = url.searchParams.get("status"), q = (url.searchParams.get("q") || "").toLowerCase();
      const items = state.submissions.filter((s) => (!status || s.status === status) && s.username.toLowerCase().includes(q));
      return route.fulfill({ json: { items, total: items.length, page: 0, size: 20 } });
    }
    const body = request.postDataJSON();
    if (state.writeError) return route.fulfill({ status: 409, json: { message: "Đơn đã thay đổi. Vui lòng tải lại." } });
    state.writes.push({ path, body });
    if (request.method() === "POST") {
      const item = { id: `application-${state.submissions.length + 1}`, user_id: account.id, username: account.username, status: "PENDING", application_reason: body.application_reason, reason: null };
      state.submissions.push(item);
      return route.fulfill({ status: 201, json: item });
    }
    const item = state.submissions.find((s) => path.includes(`/${s.id}/review`));
    Object.assign(item, body);
    return route.fulfill({ json: item });
  });
  return state;
}

test("applicant submits, waits, resubmits after rejection, and receives developer access", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/developer/register");
  const reason = page.getByRole("textbox", { name: /Lý do đăng ký/ });
  await reason.fill("  Studio phát triển game Việt  ");
  await page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true }).click();
  await expect(page.getByText(/Bạn hiện đang có một đơn/)).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].body).toEqual({ application_reason: "Studio phát triển game Việt" });
  await expect(page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true })).toHaveCount(0);

  Object.assign(state.submissions[0], { status: "REJECTED", reason: "Bổ sung kế hoạch phát hành" });
  await page.getByRole("button", { name: "Làm mới trạng thái" }).click();
  await expect(page.getByText("Bổ sung kế hoạch phát hành", { exact: true })).toBeVisible();
  await reason.fill("Kế hoạch phát hành trò chơi vào tháng tới");
  await page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true }).click();
  await expect(page.getByText(/Bạn hiện đang có một đơn/)).toBeVisible();
  expect(state.writes).toHaveLength(2);

  Object.assign(state.submissions[1], { status: "ACCEPTED", reason: "Đủ điều kiện" });
  state.account.role = "DEVELOPER";
  await page.getByRole("button", { name: "Làm mới trạng thái" }).click();
  await expect(page.getByText(/Tài khoản của bạn đã là/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Quản lý trò chơi/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/developer-registration-mobile.png", fullPage: true });
});

test("admin reads application, requires feedback, accepts and filters reviewed requests", async ({ page }) => {
  const state = await setup(page, "ADMINISTRATOR");
  state.submissions.push({ id: "request-1", user_id: applicantId, username: "Studio", status: "PENDING", application_reason: "Chúng tôi phát triển game", reason: null });
  await page.goto("/admin/developers");
  await page.getByRole("button", { name: "Xét duyệt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Chúng tôi phát triển game");
  await dialog.getByLabel("Quyết định", { exact: true }).selectOption("ACCEPTED");
  await dialog.getByLabel("Phản hồi của quản trị viên").fill("   ");
  await expect(dialog.getByRole("button", { name: "Xác nhận xét duyệt" })).toBeDisabled();
  expect(state.writes).toHaveLength(0);
  await dialog.getByLabel("Phản hồi của quản trị viên").fill("  Hồ sơ phù hợp  ");
  await dialog.getByRole("button", { name: "Xác nhận xét duyệt" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.submissions[0]).toMatchObject({ status: "ACCEPTED", application_reason: "Chúng tôi phát triển game", reason: "Hồ sơ phù hợp" });
  await page.getByLabel("Lọc trạng thái").selectOption("ACCEPTED");
  await expect(page.getByText("Hồ sơ phù hợp", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm tài khoản").fill("Không có studio này");
  await page.getByRole("button", { name: /Tìm kiếm|Tìm đơn/, exact: true }).click();
  await expect(page.getByRole("button", { name: "Xét duyệt", exact: true })).toHaveCount(0);
  expect(state.reads.some((query) => new URLSearchParams(query).get("q") === "Không có studio này")).toBe(true);
});

test("load and write failures preserve applicant text and allow retry without fake success", async ({ page }) => {
  const state = await setup(page);
  state.loadError = true;
  await page.goto("/developer/register");
  await expect(page.getByRole("alert")).toContainText("Không tải được đơn đăng ký.");
  await expect(page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true })).toBeDisabled();
  state.loadError = false;
  await page.getByRole("button", { name: "Tải lại", exact: true }).click();
  await expect(page.getByText("Bạn chưa gửi đơn đăng ký nào.", { exact: true })).toBeVisible();
  const reason = page.getByRole("textbox", { name: /Lý do đăng ký/ });
  await reason.fill("Dự án trò chơi độc lập");
  state.writeError = true;
  await page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Đơn đã thay đổi");
  await expect(reason).toHaveValue("Dự án trò chơi độc lập");
  expect(state.submissions).toHaveLength(0);
  state.writeError = false;
  await page.getByRole("button", { name: "Gửi đơn đăng ký", exact: true }).click();
  await expect(page.getByText(/Bạn hiện đang có một đơn/)).toBeVisible();
});

test("user cannot access admin review and demo never calls developer APIs", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/admin/developers");
  await expect(page.getByRole("heading", { name: "Không có quyền truy cập" })).toBeVisible();
  expect(state.reads).toHaveLength(0);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  // setup's token initializer is only needed for this initial authenticated context.
  await page.getByRole("link", { name: /Thử Demo/ }).click();
  await page.getByRole("button", { name: /Huỳnh/ }).click();
  await page.getByRole("link", { name: "Đăng ký nhà phát triển", exact: true }).click();
  await expect(page.getByText(/Chế độ Demo không hỗ trợ đăng ký/)).toBeVisible();
  expect(state.reads).toHaveLength(0);
  expect(state.writes).toHaveLength(0);
});

test("admin can reject a legacy request and recover from a conflicting review", async ({ page }) => {
  const state = await setup(page, "ADMINISTRATOR");
  state.submissions.push({ id: "legacy-request", user_id: applicantId, username: "Old Studio", status: "PENDING", application_reason: null, reason: null });
  await page.goto("/admin/developers");
  await page.getByRole("button", { name: "Xét duyệt", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Quyết định", { exact: true }).selectOption("REJECTED");
  const feedback = dialog.getByLabel("Phản hồi của quản trị viên");
  await feedback.fill("Cần gửi lại lời giới thiệu studio");
  state.writeError = true;
  await dialog.getByRole("button", { name: "Xác nhận xét duyệt" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Đơn đã thay đổi");
  await expect(feedback).toHaveValue("Cần gửi lại lời giới thiệu studio");
  expect(state.submissions[0].status).toBe("PENDING");
  state.writeError = false;
  await dialog.getByRole("button", { name: "Xác nhận xét duyệt" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.submissions[0].status).toBe("REJECTED");
  expect(state.account.role).toBe("ADMINISTRATOR");
  await page.getByLabel("Lọc trạng thái").selectOption("REJECTED");
  await expect(page.getByText("Cần gửi lại lời giới thiệu studio", { exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/developer-review-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
