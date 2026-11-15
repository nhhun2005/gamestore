import { test } from "node:test";
import assert from "node:assert/strict";
import { createStoreApi } from "../src/services/storeApi.js";

const user = { id: "player", source: "jwt" };
const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
test("store request binds encoded literal q, paging, JWT and AbortSignal", async () => {
  const calls = [], controller = new AbortController();
  const api = createStoreApi({ identity: () => user, token: () => "jwt", baseUrl: "/api/store", fetchImpl: async (url, options) => { calls.push({ url, options }); return ok(url.includes("?") ? { items: [], promotions: [], total: 0 } : { game: { id: "game/id" }, promotions: [], reviews: [], owned: false }); } });
  await api.search({ q: "%_ tiếng Việt", page: 2, size: 20, signal: controller.signal });
  const url = new URL(calls[0].url, "http://localhost");
  assert.equal(url.searchParams.get("q"), "%_ tiếng Việt");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(calls[0].options.headers.Authorization, "Bearer jwt");
  assert.equal(calls[0].options.signal, controller.signal);
  await api.detail("game/id");
  assert.equal(calls[1].url, "/api/store/games/game%2Fid");
});
test("demo, signed-out and missing token never call backend", async () => {
  let calls = 0;
  for (const identity of [() => null, () => ({ id: "demo", source: "demo" }), () => user]) {
    const api = createStoreApi({ identity, token: () => null, fetchImpl: async () => { calls++; return ok({}); } });
    await assert.rejects(api.search());
  }
  assert.equal(calls, 0);
});
test("404 and network failures remain errors; cancelled requests keep AbortError", async () => {
  const options = { identity: () => user, token: () => "jwt" };
  const missing = createStoreApi({ ...options, fetchImpl: async () => new Response(JSON.stringify({ message: "Không tìm thấy" }), { status: 404 }) });
  await assert.rejects(missing.detail("missing"), (error) => error.status === 404 && error.message === "Không tìm thấy");
  const offline = createStoreApi({ ...options, fetchImpl: async () => { throw Error("offline"); } });
  await assert.rejects(offline.search(), /Không thể kết nối/);
  const aborted = createStoreApi({ ...options, fetchImpl: async () => { throw new DOMException("cancelled", "AbortError"); } });
  await assert.rejects(aborted.search(), (error) => error.name === "AbortError");
});
test("a response cannot cross a changed account or token", async () => {
  let active = user, jwt = "first";
  const api = createStoreApi({ identity: () => active, token: () => jwt, fetchImpl: async () => { active = { id: "other" }; return ok({}); } });
  await assert.rejects(api.detail("id"), /Phiên đăng nhập đã thay đổi/);
  active = user;
  const refreshed = createStoreApi({ identity: () => active, token: () => jwt, fetchImpl: async () => { jwt = "second"; return ok({}); } });
  await assert.rejects(refreshed.search(), /Phiên đăng nhập đã thay đổi/);
});
test("malformed successful responses show an error instead of an empty catalog", async () => {
  const api = createStoreApi({ identity: () => user, token: () => "jwt", fetchImpl: async () => ok({}) });
  await assert.rejects(api.search(), /Dữ liệu cửa hàng không hợp lệ/);
  await assert.rejects(api.detail("id"), /Dữ liệu chi tiết không hợp lệ/);
});
