import { session, TOKEN_KEY } from "./session.js";

const base = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api";

async function request(path, method = "GET", body) {
  const user = session.snapshot();
  if (!user || user.source !== "jwt")
    throw Error("Vui lòng đăng nhập tài khoản thật để tiếp tục.");
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw Error("Phiên đăng nhập đã hết hạn.");
  let response;
  try {
    response = await fetch(`${base}/developer${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Error("Không thể kết nối máy chủ. Vui lòng thử lại.");
  }
  const data =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (session.snapshot()?.id !== user.id || session.snapshot()?.source !== "jwt" || localStorage.getItem(TOKEN_KEY) !== token)
    throw Error("Phiên đăng nhập đã thay đổi. Vui lòng tải lại trang.");
  if (response.status === 401) session.logout();
  if (!response.ok)
    throw Error(data?.message || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return data;
}

export const developerApi = {
  submissions: () => request("/submissions"),
  submit: (application_reason) =>
    request("/submissions", "POST", { application_reason }),
  adminSubmissions: ({ status = "", q = "", page = 0, size = 20 } = {}) => {
    const query = new URLSearchParams({ page, size });
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    return request(`/admin/submissions?${query}`);
  },
  review: (id, status, reason) =>
    request(`/admin/submissions/${encodeURIComponent(id)}/review`, "PUT", {
      status,
      reason,
    }),
};
