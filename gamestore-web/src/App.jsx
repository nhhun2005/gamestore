import { useState } from "react";
import Navbar from "./components/Navbar/Navbar";
import StorePage from "./pages/Store/StorePage";
import LibraryPage from "./pages/Library/LibraryPage";
import LoginPage from "./pages/Login/LoginPage";
import RegisterPage from "./pages/Register/RegisterPage";
import DevManageGamesPage from "./pages/DevManageGames/DevManageGamesPage";
import ManageUsersPage from "./pages/ManageUsers/ManageUserPage";
import { parseJwt } from "./utils/auth";
import "./App.css";

const TOKEN_KEY = "steam_jwt_token";

function getInitialUser() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const payload = parseJwt(token);
  if (payload && payload.exp * 1000 > Date.now()) {
    return {
      id: payload.id,
      username: payload.sub,
      email: payload.email,
      role: payload.role || "USER",
    };
  }
  localStorage.removeItem(TOKEN_KEY);
  return null;
}

function App() {
  const [user, setUser] = useState(getInitialUser);
  const [activePage, setActivePage] = useState(() =>
    getInitialUser() ? "store" : "login",
  );

  const handleAuthSuccess = (data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser({
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.role,
    });
    setActivePage("store");
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setActivePage("login");
  };

  // Chưa đăng nhập: chỉ có trang đăng nhập / đăng ký, không có Navbar
  if (!user) {
    return activePage === "register" ? (
      <RegisterPage
        onAuthSuccess={handleAuthSuccess}
        onNavigate={setActivePage}
      />
    ) : (
      <LoginPage onAuthSuccess={handleAuthSuccess} onNavigate={setActivePage} />
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case "library":
        return <LibraryPage user={user} onNavigate={setActivePage} />;
      case "manage-games":
        return user.role === "DEVELOPER" ? (
          <DevManageGamesPage />
        ) : (
          <StorePage user={user} />
        );
      case "manage-users":
        return user.role === "ADMINISTRATOR" ? (
          <ManageUsersPage user={user} />
        ) : (
          <StorePage user={user} />
        );
      case "store":
      default:
        return <StorePage user={user} />;
    }
  };

  return (
    <>
      <Navbar
        user={user}
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={handleLogout}
      />
      {renderPage()}
    </>
  );
}

export default App;
