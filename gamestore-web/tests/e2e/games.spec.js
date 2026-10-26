import { test, expect } from "@playwright/test";

function identity(role) {
  const id =
    role === "ADMINISTRATOR"
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222";
  const user = {
    id,
    username: role === "ADMINISTRATOR" ? "Admin" : "Studio",
    role,
    status: "VERIFIED",
    balance: "0.00",
  };
  const token = `e30.${Buffer.from(JSON.stringify({ id, sub: user.username, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
  return { user, token };
}
async function setup(page, initialRole = "DEVELOPER") {
  const state = {
    games: [],
    submissions: [],
    uploads: [],
    genres: [
      { id: "action", name: "Hành động" },
      { id: "rpg", name: "Nhập vai" },
    ],
  };
  let sequence = 0;
  await page.addInitScript((token) => {
    if (!localStorage.getItem("steam_jwt_token"))
      localStorage.setItem("steam_jwt_token", token);
  }, identity(initialRole).token);
  function current(route) {
    const claims = JSON.parse(
      Buffer.from(
        route.request().headers().authorization.split(" ")[1].split(".")[1],
        "base64url",
      ).toString(),
    );
    return identity(claims.role).user;
  }
  await page.route("**/api/commerce/state", (route) =>
    route.fulfill({
      json: {
        current_user: current(route),
        users: [],
        games: state.games.filter((g) => g.status === "AVAILABLE"),
        promotions: [],
        transactions: [],
        game_bought: [],
        reviews: [],
        capabilities: {},
      },
    }),
  );
  await page.route("**/api/catalog/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/catalog", ""),
      method = request.method(),
      parts = path.split("/").filter(Boolean);
    const actor = current(route),
      admin = actor.role === "ADMINISTRATOR";
    const game = state.games.find((g) => g.id === parts[1]);
    if (path === "/manage")
      return route.fulfill({
        json: {
          ...state,
          developers: [
            identity("ADMINISTRATOR").user,
            identity("DEVELOPER").user,
          ].map((u) => ({ id: u.id, username: u.username })),
        },
      });
    if (path === "/images") {
      const bytes = request.postDataBuffer();
      const start = bytes.indexOf(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      state.uploads.push({
        width: bytes.readUInt32BE(start + 16),
        height: bytes.readUInt32BE(start + 20),
      });
      return route.fulfill({
        status: 201,
        json: { url: "https://images.example.test/cover.png" },
      });
    }
    if (path === "/submissions" && method === "GET") {
      const items = state.submissions.filter(
        (s) =>
          (!url.searchParams.get("status") ||
            s.status === url.searchParams.get("status")) &&
          s.game_title
            .toLowerCase()
            .includes((url.searchParams.get("q") || "").toLowerCase()),
      );
      return route.fulfill({
        json: { items, total: items.length, page: 0, size: 20 },
      });
    }
    if (parts[0] === "submissions") {
      const submission = state.submissions.find((s) => s.id === parts[1]),
        body = request.postDataJSON();
      Object.assign(submission, {
        ...body,
        reviewed_by: actor.id,
        reviewer_name: actor.username,
        reviewed_at: new Date().toISOString(),
      });
      const target = state.games.find((g) => g.id === submission.game_id);
      target.status = body.status === "ACCEPTED" ? "AVAILABLE" : "HIDDEN";
      target.can_enable = body.status === "ACCEPTED";
      target.has_pending_submission = false;
      return route.fulfill({ json: submission });
    }
    if (parts[2] === "submissions") {
      const submission = {
        id: `submission-${++sequence}`,
        game_id: game.id,
        game_title: game.title,
        submitted_by: actor.id,
        submitter_name: actor.username,
        reviewed_by: null,
        reviewer_name: null,
        reason: null,
        status: "PENDING",
        created_at: new Date().toISOString(),
        reviewed_at: null,
      };
      state.submissions.unshift(submission);
      game.submissions.unshift(submission);
      game.has_pending_submission = true;
      return route.fulfill({ status: 201, json: submission });
    }
    if (parts[2] === "status") {
      game.status = request.postDataJSON().status;
      return route.fulfill({ json: game });
    }
    if (method === "DELETE") {
      if (parts[2] === "permanent")
        state.games = state.games.filter((g) => g.id !== game.id);
      else game.status = "HIDDEN";
      return route.fulfill({ status: 204 });
    }
    if (method === "GET") return route.fulfill({ json: game });
    const body = request.postDataJSON();
    if (!body.genre_ids?.length)
      return route.fulfill({
        status: 400,
        json: { message: "Chọn ít nhất 1 thể loại." },
      });
    const result = game || {
      id: `game-${++sequence}`,
      developer_id: body.developer_id || actor.id,
      developer_name: actor.username,
      cover_image_url: null,
      uploaded_at: new Date().toISOString(),
      submissions: [],
    };
    Object.assign(result, body);
    result.status = admin ? body.status : "HIDDEN";
    result.can_enable = false;
    result.has_pending_submission = false;
    if (game && game.developer_id !== identity("ADMINISTRATOR").user.id) {
      result.status = "HIDDEN";
      result.submissions.forEach((s) => {
        if (s.status === "ACCEPTED") {
          s.status = "REJECTED";
          s.reason = "Trò chơi đã bị chỉnh sửa";
        }
      });
    }
    if (!game) state.games.push(result);
    return route.fulfill({ status: game ? 200 : 201, json: result });
  });
  await page.route("https://images.example.test/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  return {
    state,
    async login(role, path) {
      await page.evaluate(
        (token) => localStorage.setItem("steam_jwt_token", token),
        identity(role).token,
      );
      await page.goto(path);
    },
  };
}

test("developer drafts, required genres, submission, approval, hide/enable and reapproval", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("/manage-games/new");
  await expect(
    page.getByRole("link", { name: "Trò chơi đã đăng tải", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Quản lý thể loại trò chơi" }),
  ).toHaveCount(0);
  await page.getByLabel("Tên trò chơi", { exact: true }).fill("Hành trình mới");
  await page.getByLabel("Giá (VND)").fill("120000");
  await page.getByRole("button", { name: "Tạo trò chơi", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Vui lòng chọn ít nhất 1 thể loại.",
  );
  await page.getByLabel("Hành động", { exact: true }).check();
  await page.getByLabel("Nhập vai", { exact: true }).check();
  await expect(page.getByLabel("Trạng thái game")).toHaveCount(0);
  await page.getByRole("button", { name: "Tạo trò chơi", exact: true }).click();
  await expect(page).toHaveURL(/\/manage-games$/);
  await expect(
    page.getByRole("heading", { name: "Hành trình mới", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bật lại trò chơi" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Đăng tải trò chơi", exact: true })
    .click();
  await expect(page.getByLabel("Lý do duyệt hoặc từ chối")).toHaveCount(0);
  await page.getByRole("button", { name: "Xác nhận gửi đơn" }).click();
  await expect(
    page.getByRole("button", { name: "Đang chờ duyệt", exact: true }),
  ).toBeDisabled();
  await fixture.login("ADMINISTRATOR", "/admin/games");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByText("Game đang chờ duyệt nằm trong mục Đơn đăng tải trò chơi."),
  ).toBeVisible();
  await page.getByLabel("Tìm trò chơi", { exact: true }).fill("Hành trình mới");
  await page
    .getByLabel("Lọc trạng thái", { exact: false })
    .selectOption("HIDDEN");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Đơn đăng tải trò chơi", exact: true })
    .click();
  await page.getByRole("button", { name: "Xem đơn" }).click();
  await page.getByLabel("Lý do duyệt hoặc từ chối").fill("Nội dung phù hợp.");
  await page.getByLabel("Quyết định", { exact: true }).selectOption("ACCEPTED");
  await page.getByRole("button", { name: "Xác nhận xét duyệt" }).click();
  await expect(
    page.getByText("Đã duyệt đơn và phát hành trò chơi."),
  ).toBeVisible();
  await page.getByLabel("Lọc trạng thái đơn").selectOption("ACCEPTED");
  await expect(
    page.getByRole("heading", { name: "Hành trình mới" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Quản lý trò chơi", exact: true })
    .getByRole("link", { name: "Quản lý trò chơi", exact: true })
    .click();
  await expect(
    page
      .getByRole("article")
      .getByRole("heading", { name: "Hành trình mới", exact: true }),
  ).toBeVisible();
  await fixture.login("DEVELOPER", "/manage-games");
  await page.getByRole("button", { name: "Ẩn trò chơi", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận ẩn" }).click();
  await page.getByRole("button", { name: "Bật lại trò chơi" }).click();
  await expect(page.getByText("Đã phát hành trò chơi.")).toBeVisible();
  await page.getByRole("button", { name: "Sửa Hành trình mới" }).click();
  await page.getByLabel("Mô tả trò chơi").fill("Bản cập nhật mới");
  await page.getByLabel("Nhập vai", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Bật lại trò chơi" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Đăng tải trò chơi", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Chi tiết", exact: true }).click();
  await expect(page.getByText("Lý do: Trò chơi đã bị chỉnh sửa")).toBeVisible();
  await page.getByRole("button", { name: "Đóng hộp thoại" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "output/playwright/games-developer-mobile.png",
    fullPage: true,
  });
});

test("admin CRUD, status and permanent delete; Cloudinary upload form", async ({
  page,
}) => {
  const { state } = await setup(page, "ADMINISTRATOR");
  await page.goto("/admin/games");
  await page.getByRole("button", { name: "Thêm trò chơi" }).click();
  await page.getByLabel("Tên trò chơi", { exact: true }).fill("Game của admin");
  await page.getByLabel("Hành động", { exact: true }).check();
  await page.getByLabel("Trạng thái game").selectOption("AVAILABLE");
  await expect(page.getByLabel("URL ảnh bìa HTTPS")).toHaveCount(0);
  const source = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      context.fillStyle = "red";
      context.fillRect(0, 0, 512, 512);
      context.fillStyle = "blue";
      context.fillRect(512, 0, 512, 512);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  const original = { name: "cover.png", mimeType: "image/png", buffer: source };
  await page.getByLabel(/Tải ảnh bìa/).setInputFiles(original);
  await expect(
    page.getByRole("button", { name: "Dùng ảnh 512×512" }),
  ).toBeEnabled();
  expect(state.uploads).toHaveLength(0);
  await page.getByRole("button", { name: "Hủy crop" }).click();
  expect(state.uploads).toHaveLength(0);
  await page.getByLabel(/Tải ảnh bìa/).setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(
    page.getByText("Không đọc được ảnh. Vui lòng chọn ảnh khác."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dùng ảnh 512×512" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Hủy crop" }).click();
  await page.getByLabel(/Tải ảnh bìa/).setInputFiles(original);
  await expect(page.getByLabel("Vị trí ngang")).toBeEnabled();
  const canvasBox = await page
    .getByLabel("Xem trước vùng crop 512×512")
    .boundingBox();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2 + 100,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.up();
  await expect(page.getByLabel("Vị trí ngang")).not.toHaveValue("0");
  await page.getByLabel("Vị trí ngang").focus();
  await page.getByLabel("Vị trí ngang").press("Home");
  await expect
    .poll(() =>
      page
        .getByLabel("Xem trước vùng crop 512×512")
        .evaluate((canvas) =>
          Array.from(canvas.getContext("2d").getImageData(256, 256, 1, 1).data),
        ),
    )
    .toEqual([255, 0, 0, 255]);
  await page.getByLabel("Thu phóng ảnh").focus();
  await page.getByLabel("Thu phóng ảnh").press("ArrowRight");
  await expect(page.getByLabel("Thu phóng ảnh")).not.toHaveValue("1");
  await page.getByLabel("Thu phóng ảnh").press("Home");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Xem trước vùng crop 512×512").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "output/playwright/game-cover-crop-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Dùng ảnh 512×512" }).click();
  await expect(page.getByAltText("Xem trước ảnh bìa")).toHaveAttribute(
    "src",
    "https://images.example.test/cover.png",
  );
  expect(state.uploads).toEqual([{ width: 512, height: 512 }]);
  await page.getByRole("button", { name: "Tạo trò chơi", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("article").getByText("Đang phát hành", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sửa Game của admin" }).click();
  await expect(page.getByLabel("URL ảnh bìa HTTPS")).toHaveCount(0);
  await expect(page.getByLabel(/Tải ảnh bìa/)).toBeVisible();
  await page.getByLabel("Tên trò chơi", { exact: true }).fill("Game đã sửa");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: "output/playwright/games-admin-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Xóa Game đã sửa" }).click();
  await page.getByRole("button", { name: "Xác nhận xóa hoàn toàn" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Chưa có trò chơi. Hãy tạo trò chơi đầu tiên."),
  ).toBeVisible();
});

test("developer cannot open admin games or submission queue", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin/games/submissions");
  await expect(
    page.getByRole("heading", { name: "Không có quyền truy cập" }),
  ).toBeVisible();
});
