import { test, expect } from "@playwright/test";

test("store search ignores case, handles no matches, and opens game details", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Huỳnh/ }).click();
  await expect(page).toHaveURL(/store/);

  const search = page.getByRole("textbox", { name: "Tìm trong cửa hàng" });
  await search.fill("pIxEl");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Pixel Valley Farming" })).toBeVisible();
  await page.getByRole("link", { name: "Xem chi tiết", exact: true }).click();
  await expect(page).toHaveURL(/\/games\//);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const details = page.getByRole("main");
  await expect(details.getByRole("heading", { name: "Pixel Valley Farming", level: 1 })).toBeVisible();
  await expect(details).toContainText("chăm sóc nông trại");
  await expect(details.getByRole("heading", { name: "Về trò chơi này" })).toBeVisible();
  await page.getByRole("link", { name: "Về cửa hàng", exact: true }).click();

  await search.fill("không tồn tại 123456");
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText("Không tìm thấy trò chơi.", { exact: true })).toBeVisible();
  await search.clear();
  await expect(page.getByRole("article")).toHaveCount(6);
});
