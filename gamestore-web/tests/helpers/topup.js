import { expect } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

export async function readTopUpCode(page) {
  const image = page.getByRole("img", { name: "QR nạp tiền", exact: true });
  await expect(image).toBeVisible();
  const src = await image.getAttribute("src");
  expect(src).toMatch(/^data:image\/png;base64,/);
  const png = PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(
    decoded,
    "QR image must independently decode to a confirmation code",
  ).not.toBeNull();
  expect(decoded.data).toMatch(/^GS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  return decoded.data;
}

export async function confirmTopUpQr(page) {
  const gateway = page.getByRole("heading", {
    name: "Chọn phương thức nạp tiền",
    exact: true,
  });
  const legacyQr = page.getByRole("img", { name: "QR nạp tiền", exact: true });
  await expect(gateway.or(legacyQr).first()).toBeVisible();
  if (await gateway.isVisible()) {
    await page.getByRole("button", { name: "Quét mã QR", exact: true }).click();
    const qr = page.getByRole("img", {
      name: "QR thanh toán GameStore Pay",
      exact: true,
    });
    await expect(qr).toBeVisible();
    const src = await qr.getAttribute("src");
    const png = PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));
    const decoded = jsQR(
      new Uint8ClampedArray(png.data),
      png.width,
      png.height,
    );
    expect(decoded).not.toBeNull();
    const code = new URL(decoded.data).searchParams.get("code");
    await page.getByLabel("Mã xác nhận QR", { exact: true }).fill(code);
    await page.getByRole("button", { name: /^Xác nhận thanh toán/ }).click();
    await expect(
      page.getByRole("heading", { name: "Nạp tiền thành công", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Về ví của tôi", exact: true })
      .click();
    return;
  }
  const code = await readTopUpCode(page);
  await page.getByLabel("Mã xác nhận", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Xác nhận nạp", exact: true }).click();
}
