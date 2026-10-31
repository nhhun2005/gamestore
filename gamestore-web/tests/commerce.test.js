import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCommerceService,
  COMMERCE_KEY,
} from "../src/services/commerceService.js";
import { cents, decimal, priceOf, dayOf, money } from "../src/services/currency.js";
import {
  decodeSession,
  TOKEN_KEY,
  demoUsers,
} from "../src/services/session.js";
import { createSeed, gameId } from "../src/mocks/commerceSeed.js";
function fixture() {
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key),
    setItem: (key, value) => map.set(key, value),
  };
  let current = demoUsers[0];
  const service = createCommerceService({
    storage,
    currentUser: () => current,
    delay: 0,
  });
  return {
    service,
    storage,
    select: (user) => {
      current = user;
    },
    options: { storage, currentUser: () => current, delay: 0 },
  };
}
test("one consistent deposit, purchase, review, revenue and persistence journey", async () => {
  const { service: s, storage, select, options } = fixture();
  await s.topUp("500000");
  await s.purchase(gameId(3));
  assert.equal(s.snapshot().users[0].balance, "435000.00");
  assert.equal(s.snapshot().transactions[0].type, "BUY");
  assert.equal(s.snapshot().transactions[0].status, "SUCCESSED");
  assert.equal(
    s.snapshot().game_bought[0].transaction_id,
    s.snapshot().transactions[0].id,
  );
  await s.saveReview(gameId(3), 4.5, "Đáng chơi");
  await s.saveReview(gameId(3), 4, "Đã cập nhật");
  assert.equal(s.snapshot().reviews.length, 1);
  assert.equal(s.snapshot().games[2].rating, 4);
  await s.deleteReview(s.snapshot().reviews[0].id);
  assert.equal(s.snapshot().games[2].rating, null);
  assert.equal(
    createCommerceService(options).snapshot().users[0].balance,
    "435000.00",
  );
  await s.purchase(gameId(5));
  select(demoUsers[1]);
  assert.equal((await s.revenue()).length, 1);
  assert.equal((await s.revenue())[0].amount, "165000.00");
  select(demoUsers[2]);
  assert.equal((await s.revenue()).length, 2);
  assert.deepEqual(await s.revenue({ from: "2099-01-01" }), []);
  const saved = JSON.parse(storage.getItem(COMMERCE_KEY));
  saved.games[2].price = "999999.00";
  storage.setItem(COMMERCE_KEY, JSON.stringify(saved));
  assert.equal(
    (await createCommerceService(options).revenue()).find(
      (t) => t.game_id === gameId(3),
    ).amount,
    "165000.00",
  );
});
test("validation, insufficient funds, unavailable, missing, duplicate and free games", async () => {
  const { service: s } = fixture();
  for (const amount of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e5",
    "0.001",
    "",
    "100000001",
  ])
    await assert.rejects(s.topUp(amount));
  await assert.rejects(s.purchase(gameId(3)), /Số dư/);
  await assert.rejects(s.purchase(gameId(6)), /chưa mở bán/);
  await assert.rejects(s.purchase("missing"), /không tồn tại/);
  await s.purchase(gameId(5));
  await assert.rejects(s.purchase(gameId(5)), /đã sở hữu/);
  assert.equal(s.snapshot().users[0].balance, "100000.00");
  assert.equal(s.snapshot().transactions.length, 1);
});
test("duplicate submission and identity changes cannot apply a second or wrong-user operation", async () => {
  const { service: s, select } = fixture();
  const first = s.topUp("500000");
  await assert.rejects(s.topUp("500000"), /đang được xử lý/);
  await first;
  assert.equal(s.snapshot().users[0].balance, "600000.00");
  const changing = s.purchase(gameId(3));
  select(demoUsers[1]);
  await assert.rejects(changing, /đã thay đổi/);
  assert.equal(s.snapshot().game_bought.length, 0);
});
test("review ownership, author, content and half-step rating rules", async () => {
  const { service: s, select } = fixture();
  await assert.rejects(s.saveReview(gameId(1), 5, "Hello"), /sở hữu/);
  await s.purchase(gameId(5));
  for (const rating of [0, 5.5, 1.49, NaN, "4"])
    await assert.rejects(s.saveReview(gameId(5), rating, "Hello"));
  await assert.rejects(s.saveReview(gameId(5), 5, "  "));
  await assert.rejects(s.saveReview(gameId(5), 5, "a".repeat(2001)));
  await s.saveReview(gameId(5), 3.5, "Hello");
  const review = s.snapshot().reviews[0];
  select(demoUsers[1]);
  await assert.rejects(s.deleteReview(review.id), /của bạn/);
  select(demoUsers[0]);
  await s.deleteReview(review.id);
  assert.equal(s.snapshot().games[4].rating, null);
});
test("service roles, anonymous and expired sessions and disabled production service", async () => {
  const { service: s, select, options } = fixture();
  await assert.rejects(s.revenue(), /quyền/);
  select(null);
  await assert.rejects(s.topUp("100"), /đăng nhập/);
  select({ ...demoUsers[0], expiresAt: 1 });
  await assert.rejects(s.purchase(gameId(5)), /hết hạn/);
  select(demoUsers[2]);
  const production = createCommerceService({ ...options, enabled: false });
  await assert.rejects(production.topUp("100"), /API/);
  await assert.rejects(production.revenue(), /API/);
});
test("empty data, reset, malformed storage, failed persistence and real account profiles", async () => {
  const { service: s, select, options, storage } = fixture();
  assert.equal(s.snapshot().transactions.length, 0);
  assert.equal(s.snapshot().game_bought.length, 0);
  select(demoUsers[1]);
  assert.deepEqual(await s.revenue(), []);
  select({ id: "actual-account", username: "Actual User", role: "USER" });
  await s.prepareAccount();
  await s.topUp("0.05");
  assert.equal(
    s.snapshot().users.find((u) => u.id === "actual-account").balance,
    "100000.05",
  );
  await s.reset();
  assert.equal(
    s.snapshot().users.find((u) => u.id === "actual-account").balance,
    "100000.00",
  );
  assert.equal(s.snapshot().transactions.length, 0);
  storage.setItem(COMMERCE_KEY, "{bad");
  assert.equal(createCommerceService(options).snapshot().version, 2);
  const malformed = createSeed();
  malformed.promotions[0].discount = "invalid";
  storage.setItem(COMMERCE_KEY, JSON.stringify(malformed));
  assert.equal(
    createCommerceService(options).snapshot().promotions[0].discount,
    "25",
  );
  const broken = createCommerceService({
    ...options,
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error("quota");
      },
    },
  });
  select(demoUsers[0]);
  await assert.rejects(broken.topUp("500000"), /Không thể lưu/);
  assert.equal(broken.snapshot().users[0].balance, "100000.00");
});
test("decimal-safe money, fractional discounts, disabled promotion and Vietnamese dates", () => {
  assert.equal(decimal(cents("0.10") + cents("0.20")), "0.30");
  assert.equal(money('99999999999999999.99'), '99.999.999.999.999.999,99\u00a0₫');
  const seed = createSeed();
  assert.equal(priceOf(seed.games[0], seed.promotions).final, "367500.00");
  assert.equal(
    priceOf({ price: "3.00", promotion_id: "p" }, [
      { id: "p", discount: "12.5", status: "ENABLED" },
    ]).final,
    "2.63",
  );
  assert.equal(
    priceOf({ price: "3.00", promotion_id: "p" }, [
      { id: "p", discount: "50", status: "DISABLED" },
    ]).final,
    "3.00",
  );
  assert.equal(dayOf("2026-10-24T18:00:00Z"), "2026-10-25");
});
test("the existing JWT contract survives reload and rejects malformed or expired tokens", () => {
  const jwt = (claims) =>
    `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  const user = decodeSession(
    jwt({
      id: "actual-id",
      sub: "Huỳnh",
      role: "DEVELOPER",
      exp: Date.now() / 1000 + 3600,
    }),
  );
  assert.equal(TOKEN_KEY, "steam_jwt_token");
  assert.equal(user.username, "Huỳnh");
  assert.equal(user.role, "DEVELOPER");
  assert.equal(user.source, "jwt");
  assert.equal(decodeSession(jwt({ id: "id", sub: "name", exp: 1 })), null);
  assert.equal(decodeSession("malformed"), null);
});

test("wishlist add and remove updates state properly", async () => {
  const { service: s } = fixture();
  assert.deepEqual(s.snapshot().wishlist, []);
  await s.addWishlist(gameId(1));
  assert.equal(s.snapshot().wishlist.length, 1);
  assert.equal(s.snapshot().wishlist[0].game_id, gameId(1));
  await s.addWishlist(gameId(1));
  assert.equal(s.snapshot().wishlist.length, 1);
  await s.removeWishlist(gameId(1));
  assert.equal(s.snapshot().wishlist.length, 0);
});
