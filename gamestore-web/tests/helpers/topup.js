import { expect } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

export async function readTopUpCode(page) {
  const image = page.getByRole("img", { name: "QR nạp tiền mô phỏng", exact: true });
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded, "QR image must independently decode to a confirmation code").not.toBeNull();
  expect(decoded.data).toMatch(/^GS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  return decoded.data;
}

export async function confirmTopUpQr(page) {
  const code = await readTopUpCode(page);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
}
