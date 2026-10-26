// Decimal strings mirror PostgreSQL NUMERIC(19,2). All ledger math uses BigInt cents.
export function cents(value) {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text))
    throw Error("Số tiền không hợp lệ (tối đa 2 chữ số thập phân).");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function decimal(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
export function money(value) {
  const amount = cents(value);
  const whole = new Intl.NumberFormat("vi-VN").format(amount / 100n);
  const fraction = String(amount % 100n)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? "," + fraction : ""}\u00a0₫`;
}
export function priceOf(game, promotions) {
  const promotion = promotions.find(
    (p) => p.id === game.promotion_id && p.status === "ENABLED",
  );
  if (!promotion)
    return { original: game.price, discount: "0", final: game.price };
  const discount = String(promotion.discount);
  if (!/^\d+(\.\d+)?$/.test(discount)) throw Error("Khuyến mãi không hợp lệ.");
  const [whole, fraction = ""] = discount.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0 || numerator > denominator * 100n)
    throw Error("Khuyến mãi không hợp lệ.");
  const divisor = denominator * 100n;
  const final =
    (cents(game.price) * (divisor - numerator) + divisor / 2n) / divisor;
  return { original: game.price, discount, final: decimal(final) };
}
export const dayOf = (timestamp) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
