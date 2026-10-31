import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpCommerceService } from "../src/services/commerceApi.js";
const user = { id: "actual-user", source: "jwt" };
function state(balance = "500000.00") {
  return {
    current_user: { id: user.id, username: "Player", role: "USER", balance },
    users: [
      { id: user.id, username: "Player" },
      { id: "developer", username: "Studio" },
    ],
    games: [],
    promotions: [],
    transactions: [],
    game_bought: [],
    reviews: [],
    wishlist: [{ game_id: "game-1", created_at: "2026-10-31T00:00:00Z" }],
    capabilities: { demo_topups: true },
  };
}
test("real HTTP adapter supplies JWT, idempotency and JSON and refreshes the shared snapshot", async () => {
  const calls = [];
  const api = createHttpCommerceService({
    identity: () => user,
    token: () => "actual-token",
    baseUrl: "/api/commerce",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      return new Response(
        JSON.stringify(
          url.endsWith("/state") ? state() : { id: "saved-transaction" },
        ),
        { status: 200 },
      );
    },
  });
  let updates = 0;
  api.subscribe(() => updates++);
  await api.prepareAccount();
  assert.equal(api.snapshot().users[0].balance, "500000.00");
  assert.equal(api.snapshot().wishlist.length, 1);
  const key = "550e8400-e29b-41d4-a716-446655440000";
  await api.topUp("500000", key);
  await api.purchase("game-id", key, "200000.00");
  const post = calls.find((c) => c.url.endsWith("/purchases"));
  assert.equal(post.headers.Authorization, "Bearer actual-token");
  assert.equal(post.headers["Idempotency-Key"], key);
  assert.deepEqual(JSON.parse(post.body), {
    game_id: "game-id",
    expected_amount: "200000.00",
  });
  assert.equal(updates, 3);
});
test("HTTP errors/network failures never mutate a local mock wallet or fake success", async () => {
  const api = createHttpCommerceService({
    identity: () => user,
    token: () => "token",
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Số dư không đủ." }), {
        status: 402,
      }),
  });
  await assert.rejects(api.topUp("100"), /Số dư không đủ/);
  const offline = createHttpCommerceService({
    identity: () => user,
    token: () => "token",
    fetchImpl: () => Promise.reject(Error("network down")),
  });
  await assert.rejects(offline.prepareAccount(), /Không thể kết nối backend/);
});
test("cached data and delayed responses cannot cross account boundaries", async () => {
  let current = user;
  const api = createHttpCommerceService({
    identity: () => current,
    token: () => "token",
    baseUrl: "/api/commerce",
    fetchImpl: async () =>
      new Response(JSON.stringify(state()), { status: 200 }),
  });
  await api.prepareAccount();
  current = { id: "another-user", source: "jwt" };
  assert.equal(api.snapshot().users.length, 0);
  const changed = createHttpCommerceService({
    identity: () => current,
    token: () => "token",
    baseUrl: "/api/commerce",
    fetchImpl: async () => {
      current = user;
      return new Response(JSON.stringify(state()), { status: 200 });
    },
  });
  await assert.rejects(changed.prepareAccount(), /đã thay đổi/);
});
test("an older snapshot response cannot overwrite a newer wallet balance", async () => {
  const pending = [];
  const api = createHttpCommerceService({
    identity: () => user,
    token: () => "token",
    baseUrl: "/api/commerce",
    fetchImpl: () => new Promise((resolve) => pending.push(resolve)),
  });
  const older = api.prepareAccount();
  const newer = api.prepareAccount();
  pending[1](new Response(JSON.stringify(state("600000.00")), { status: 200 }));
  await newer;
  pending[0](new Response(JSON.stringify(state("100000.00")), { status: 200 }));
  await older;
  assert.equal(api.snapshot().users[0].balance, "600000.00");
});
test("wishlist and notifications API calls send correct authorization and method", async () => {
  const calls = [];
  const api = createHttpCommerceService({
    identity: () => user,
    token: () => "token-123",
    baseUrl: "/api/commerce",
    fetchImpl: async (url, options) => {
      calls.push({ url, ...options });
      if (url.endsWith("/state")) {
        return new Response(JSON.stringify(state()), { status: 200 });
      }
      if (url.endsWith("/notifications")) {
        return new Response(
          JSON.stringify({ items: [{ id: "n1", title: "Sale" }], unread_count: 1 }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 204 });
    },
  });
  await api.addWishlist("game-abc");
  const addCall = calls.find((c) => c.url.includes("/wishlist/game-abc") && c.method === "POST");
  assert.ok(addCall);
  assert.equal(addCall.headers.Authorization, "Bearer token-123");

  await api.removeWishlist("game-abc");
  const delCall = calls.find((c) => c.url.includes("/wishlist/game-abc") && c.method === "DELETE");
  assert.ok(delCall);
  assert.equal(delCall.headers.Authorization, "Bearer token-123");

  const notifs = await api.notifications();
  assert.equal(notifs.items.length, 1);
  assert.equal(notifs.unread_count, 1);

  await api.markNotificationRead("n1");
  const markCall = calls.find((c) => c.url.includes("/notifications/n1/read"));
  assert.equal(markCall.method, "PUT");

  await api.markAllNotificationsRead();
  const markAllCall = calls.find((c) => c.url.includes("/notifications/read-all"));
  assert.equal(markAllCall.method, "PUT");
});
