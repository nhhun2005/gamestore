import { NavLink, Outlet } from "react-router-dom";
import "./ManageGames.css";

export default function ManageGamesPage() {
  return <main className="steam-main-content commerce-page genre-page">
    <h1>Quản lý trò chơi</h1>
    <nav className="genre-tabs" aria-label="Quản lý trò chơi">
      <NavLink to="/admin/games" end>Quản lý trò chơi</NavLink>
      <NavLink to="/admin/games/genres">Quản lý thể loại trò chơi</NavLink>
    </nav>
    <Outlet />
  </main>;
}
export function GamesPlaceholder() {
  return <section className="commerce-panel"><h2>Quản lý trò chơi</h2><p>Chức năng đang được phát triển.</p></section>;
}
