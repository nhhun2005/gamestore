import "./Navbar.css";

function Navbar({ user, activePage, onNavigate, onLogout }) {
  return (
    <header className="steam-navbar">
      <div className="steam-navbar-container">
        <div className="steam-brand-and-links">
          <div className="steam-logo" onClick={() => onNavigate("store")}>
            <div className="steam-logo-badge">🎮</div>
            <span>STEAM STORE</span>
          </div>

          <ul className="steam-nav-links">
            <li
              className={`steam-nav-item ${activePage === "store" ? "active" : ""}`}
              onClick={() => onNavigate("store")}
            >
              Cửa hàng (Store)
            </li>
            <li
              className={`steam-nav-item ${activePage === "library" ? "active" : ""}`}
              onClick={() => onNavigate("library")}
            >
              Thư viện (Library)
            </li>

            {/* Chỉ hiện khi là DEVELOPER */}
            {user?.role === "DEVELOPER" && (
              <li
                className={`steam-nav-item role-special ${
                  activePage === "manage-games" ? "active" : ""
                }`}
                onClick={() => onNavigate("manage-games")}
              >
                Quản lý Game
              </li>
            )}

            {/* Chỉ hiện khi là ADMIN */}
            {user?.role === "ADMIN" && (
              <li
                className={`steam-nav-item role-special ${
                  activePage === "manage-users" ? "active" : ""
                }`}
                onClick={() => onNavigate("manage-users")}
              >
                Quản lý người dùng
              </li>
            )}
          </ul>
        </div>

        <div className="steam-user-actions">
          {user ? (
            <>
              <div className="user-info-box">
                <span className="user-name">{user.username}</span>
                <span className={`role-tag ${user.role}`}>{user.role}</span>
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
