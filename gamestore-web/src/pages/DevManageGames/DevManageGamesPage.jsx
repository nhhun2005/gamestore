import { NavLink, Outlet } from "react-router-dom";
import "../ManageGames/ManageGames.css";

export default function DevManageGamesPage() {
  return (
    <main className="steam-main-content commerce-page genre-page">
      <h1>Quản lý trò chơi</h1>
      <nav className="genre-tabs" aria-label="Quản lý trò chơi của developer">
        <NavLink to="/manage-games/new">Đăng tải trò chơi</NavLink>
        <NavLink to="/manage-games" end>
          Trò chơi đã đăng tải
        </NavLink>
      </nav>
      <Outlet />
    </main>
  );
}
