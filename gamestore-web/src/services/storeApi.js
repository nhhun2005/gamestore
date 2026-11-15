import { TOKEN_KEY, session } from "./session.js";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api";

export function createStoreApi({
  fetchImpl = (...args) => fetch(...args),
  identity = session.snapshot,
  token = () => localStorage.getItem(TOKEN_KEY),
  baseUrl = `${API_BASE}/store`,
} = {}) {
  async function request(path, { signal } = {}) {
    const user = identity();
    if (!user || user.source === "demo") throw Error("Vui lòng đăng nhập tài khoản thật để sử dụng API.");
    const jwt = token();
    if (!jwt) throw Error("Phiên đăng nhập đã hết hạn.");
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${jwt}` }, signal });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw Error("Không thể kết nối backend. Vui lòng thử lại.");
    }
    const data = await response.json().catch(() => null);
    if (identity()?.id !== user.id || token() !== jwt) throw Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại dữ liệu.");
    if (response.status === 401 && identity === session.snapshot) session.logout();
    if (!response.ok) {
      const error = Error(data?.message || `Yêu cầu thất bại (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  return {
    async search({ q = "", page = 0, size = 20, signal } = {}) {
      const data = await request(`/games?${new URLSearchParams({ q, page, size })}`, { signal });
      if (!Array.isArray(data?.items) || !Array.isArray(data?.promotions) || !Number.isInteger(data?.total) || data.total < 0) throw Error("Dữ liệu cửa hàng không hợp lệ. Vui lòng thử lại.");
      return data;
    },
    async detail(id, { signal } = {}) {
      const data = await request(`/games/${encodeURIComponent(id)}`, { signal });
      if (!data?.game?.id || !Array.isArray(data.promotions) || !Array.isArray(data.reviews) || typeof data.owned !== "boolean") throw Error("Dữ liệu chi tiết không hợp lệ. Vui lòng thử lại.");
      return data;
    },
  };
}

export const storeApi = createStoreApi();
