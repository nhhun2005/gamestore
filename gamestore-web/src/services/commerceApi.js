import { TOKEN_KEY, session } from "./session.js";
export const EMPTY_COMMERCE_STATE = {
  users: [],
  games: [],
  promotions: [],
  transactions: [],
  game_bought: [],
  reviews: [],
  wishlist: [],
  capabilities: { demo_topups: false },
};
const API_BASE =
  import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api";
export function createHttpCommerceService({
  fetchImpl = (...args) => fetch(...args),
  identity = session.snapshot,
  token = () => localStorage.getItem(TOKEN_KEY),
  baseUrl = `${API_BASE}/commerce`,
} = {}) {
  let cache = EMPTY_COMMERCE_STATE;
  let cacheOwner = null;
  let loadSequence = 0;
  const listeners = new Set();
  async function request(path, { method = "GET", body, key } = {}) {
    const user = identity();
    if (!user || user.source === "demo")
      throw Error("Vui lòng đăng nhập tài khoản thật để sử dụng API.");
    const jwt = token();
    if (!jwt) throw Error("Phiên đăng nhập đã hết hạn.");
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${jwt}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Error(
        "Không thể kết nối backend. Kiểm tra server cổng 8080 và thử lại.",
      );
    }
    const data =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (
      response.status === 401 &&
      identity === session.snapshot &&
      session.snapshot()?.id === user.id
    )
      session.logout();
    if (!response.ok) {
      const error = Error(
        data?.message || `Yêu cầu thất bại (HTTP ${response.status}).`,
      );
      error.status = response.status;
      throw error;
    }
    if (identity()?.id !== user.id)
      throw Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại dữ liệu.");
    return data;
  }
  async function prepareAccount() {
    const user = identity();
    const sequence = ++loadSequence;
    const data = await request("/state");
    if (identity()?.id !== user.id || sequence !== loadSequence) return;
    cache = {
      ...data,
      users: [
        data.current_user,
        ...data.users.filter((u) => u.id !== data.current_user.id),
      ],
      wishlist: data.wishlist || [],
    };
    cacheOwner = user.id;
    if (identity === session.snapshot) session.updateProfile(data.current_user);
    listeners.forEach((fn) => fn());
  }
  async function mutation(path, options) {
    let result;
    try {
      result = await request(path, options);
    } catch (error) {
      if (error.status === 409) await prepareAccount().catch(() => {});
      throw error;
    }
    await prepareAccount();
    return result;
  }
  return {
    snapshot: () =>
      identity()?.id === cacheOwner ? cache : EMPTY_COMMERCE_STATE,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    prepareAccount,
    topUp(amount, key = crypto.randomUUID()) {
      return mutation("/wallet/demo-topups", {
        method: "POST",
        body: { amount },
        key,
      });
    },
    purchase(game_id, key = crypto.randomUUID(), expected_amount) {
      return mutation("/purchases", {
        method: "POST",
        body: { game_id, expected_amount },
        key,
      });
    },
    saveReview(gameId, rating, content) {
      return mutation(`/games/${encodeURIComponent(gameId)}/review`, {
        method: "PUT",
        body: { rating, content },
      });
    },
    deleteReview(id) {
      return mutation(`/reviews/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
    addWishlist(gameId) {
      return mutation(`/wishlist/${encodeURIComponent(gameId)}`, {
        method: "POST",
      });
    },
    removeWishlist(gameId) {
      return mutation(`/wishlist/${encodeURIComponent(gameId)}`, {
        method: "DELETE",
      });
    },
    notifications() {
      return request("/notifications");
    },
    markNotificationRead(id) {
      return request(`/notifications/${encodeURIComponent(id)}/read`, {
        method: "PUT",
      });
    },
    markAllNotificationsRead() {
      return request("/notifications/read-all", {
        method: "PUT",
      });
    },
    revenue({ from = "", to = "" } = {}) {
      const query = new URLSearchParams();
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      return request(`/revenue?${query}`);
    },
    reset() {
      return Promise.reject(
        Error("Không thể đặt lại dữ liệu backend từ giao diện."),
      );
    },
  };
}
export const commerceApi = createHttpCommerceService();
