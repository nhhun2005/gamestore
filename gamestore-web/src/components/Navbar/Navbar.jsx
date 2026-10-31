import { NavLink } from "react-router-dom";
import NotificationBell from "../Notifications/NotificationBell";
import "./Navbar.css";

function Navbar({ user, activePage, onNavigate, onLogout, balance }) {
  const pages = [
    ["store", "Cửa hàng (Store)"],
    ["library", "Thư viện (Library)"],
    ["wishlist", "Yêu thích"],
    ["wallet", "Ví"],
    ["transactions", "Giao dịch"],
  ];
  if (user?.role === "DEVELOPER")
    pages.push(
      ["manage-games", "Quản lý trò chơi"],
      ["developer/revenue", "Doanh thu"],
    );
  if (user?.role === "ADMINISTRATOR")
    pages.push(
      ["manage-users", "Quản lý người dùng"],
      ["admin/games", "Quản lý trò chơi"],
      ["admin/promotions", "Khuyến mãi"],
      ["admin/revenue", "Doanh thu"],
    );
  return (
    <header className="steam-navbar">
      <div className="steam-navbar-container">
        <div className="steam-brand-and-links">
          <button className="steam-logo" onClick={() => onNavigate("store")}>
            <span className="steam-logo-badge" aria-hidden="true">
              🎮
            </span>
            <span>STEAM STORE</span>
          </button>
          <nav aria-label="Điều hướng chính" className="steam-nav-links">
            {pages.map(([page, label]) => (
              <NavLink
                key={page}
                to={`/${page}`}
                className={`steam-nav-item ${activePage === page ? "active" : ""} ${page.startsWith("manage-") ? "role-special" : ""}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="steam-user-actions">
          {user ? (
            <>
              {user.source === "jwt" && <NotificationBell />}
              <div className="user-info-box">
                <span className="user-name">{user.username}</span>
                <span className={`role-tag ${user.role}`}>{user.role}</span>
                {balance && <NavLink to="/wallet">{balance}</NavLink>}
              </div>
              <button className="steam-auth-btn" onClick={onLogout}>
                Đăng xuất
              </button>
            </>
          ) : (
            <>
              <button
                className="steam-auth-btn primary"
                onClick={() => onNavigate("login")}
              >
                Đăng nhập
              </button>
              <button
                className="steam-auth-btn"
                onClick={() => onNavigate("register")}
              >
                Đăng ký
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
export default Navbar;
