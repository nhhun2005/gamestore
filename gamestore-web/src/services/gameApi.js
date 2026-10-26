import { session, TOKEN_KEY } from "./session.js";

const base = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api";
async function request(path, method = "GET", body) {
  const user = session.snapshot();
  if (!user || user.source !== "jwt")
    throw Error("Vui lòng đăng nhập tài khoản thật để quản lý trò chơi.");
  const multipart = body instanceof FormData;
  let response;
  try {
    response = await fetch(`${base}/catalog${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (session.snapshot()?.id !== user.id)
    throw Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang.");
  if (response.status === 401) session.logout();
  if (!response.ok)
    throw Error(data?.message || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return data;
}
export const gameApi = {
  management: () => request("/manage"),
  get: (id) => request(`/games/${encodeURIComponent(id)}`),
  save: (id, body) =>
    request(
      id ? `/games/${encodeURIComponent(id)}` : "/games",
      id ? "PUT" : "POST",
      body,
    ),
  hide: (id) => request(`/games/${encodeURIComponent(id)}`, "DELETE"),
  remove: (id) =>
    request(`/games/${encodeURIComponent(id)}/permanent`, "DELETE"),
  visibility: (id, status) =>
    request(`/games/${encodeURIComponent(id)}/status`, "PUT", { status }),
  submit: (id) =>
    request(`/games/${encodeURIComponent(id)}/submissions`, "POST"),
  submissions: ({ status = "", q = "", page = 0 } = {}) => {
    const query = new URLSearchParams({ q, page, size: 20 });
    if (status) query.set("status", status);
    return request(`/submissions?${query}`);
  },
  review: (id, status, reason) =>
    request(`/submissions/${encodeURIComponent(id)}/review`, "PUT", {
      status,
      reason,
    }),
  upload: (file) => {
    const body = new FormData();
    body.append("file", file);
    return request("/images", "POST", body);
  },
};
