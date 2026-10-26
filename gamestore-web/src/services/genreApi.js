import { session, TOKEN_KEY } from "./session.js";

const base = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api";
async function request(path = "", method = "GET", body) {
  const user = session.snapshot();
  if (!user || user.source !== "jwt")
    throw Error("Vui lòng đăng nhập tài khoản quản trị thật để quản lý thể loại.");
  let response;
  try {
    response = await fetch(`${base}/admin/genres${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (session.snapshot()?.id !== user.id)
    throw Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang.");
  if (response.status === 401) session.logout();
  if (!response.ok) throw Error(data?.message || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return data;
}
export const genreApi = {
  list: () => request(),
  games: () => request("/games"),
  save: (id, data) => request(id ? `/${encodeURIComponent(id)}` : "", id ? "PUT" : "POST", data),
  delete: (id) => request(`/${encodeURIComponent(id)}`, "DELETE"),
  link: (id, game, assigned) => request(`/${encodeURIComponent(id)}/games/${encodeURIComponent(game)}`, assigned ? "PUT" : "DELETE"),
};
