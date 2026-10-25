import { parseJwt } from "../utils/auth.js";

export const TOKEN_KEY = "steam_jwt_token";
const DEMO_KEY = "gamestore.dev-session.v2";
export const demoUsers = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    username: "Huỳnh",
    role: "USER",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    username: "Aurora Studio",
    role: "DEVELOPER",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    username: "Administrator",
    role: "ADMINISTRATOR",
  },
];
export function decodeSession(token, now = Date.now()) {
  const claims = parseJwt(token);
  if (
    !claims ||
    typeof claims.id !== "string" ||
    !claims.id ||
    typeof claims.sub !== "string" ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= now ||
    !["USER", "DEVELOPER", "ADMINISTRATOR"].includes(claims.role || "USER")
  )
    return null;
  return {
    id: claims.id,
    username: claims.sub,
    email: claims.email,
    role: claims.role || "USER",
    expiresAt: claims.exp * 1000,
    source: "jwt",
  };
}
function restore() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      const user = decodeSession(token);
      if (user) return user;
      localStorage.removeItem(TOKEN_KEY);
    }
    if (import.meta.env?.DEV) {
      const fixture = demoUsers.find(
        (u) => u.id === sessionStorage.getItem(DEMO_KEY),
      );
      if (fixture) return { ...fixture, source: "demo" };
    }
  } catch {
    /* Unavailable browser storage leaves the account signed out. */
  }
  return null;
}
let current = restore();
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
export const session = {
  snapshot: () => current,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  login(data) {
    const user = decodeSession(data.token);
    if (!user) throw Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    localStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.removeItem(DEMO_KEY);
    current = user;
    notify();
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(DEMO_KEY);
    current = null;
    notify();
  },
  demo(id) {
    if (!import.meta.env.DEV || current?.source === "jwt")
      throw Error("Vui lòng đăng xuất tài khoản thật trước khi dùng Demo.");
    const user = demoUsers.find((u) => u.id === id);
    if (!user) throw Error("Danh tính Demo không tồn tại.");
    sessionStorage.setItem(DEMO_KEY, id);
    current = { ...user, source: "demo" };
    notify();
  },
};
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === TOKEN_KEY || event.key === null) {
      current = restore();
      notify();
    }
  });
}
