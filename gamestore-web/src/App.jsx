import { useState, useEffect } from "react";
import Navbar from "./components/Navbar/Navbar";
import StorePage from "./pages/Store/StorePage";
import LibraryPage from "./pages/Library/LibraryPage";
import LoginPage from "./pages/Login/LoginPage";
import RegisterPage from "./pages/Register/RegisterPage";
import DevManageGamesPage from "./pages/DevManageGames/DevManageGamesPage";
import ManageUsersPage from "./pages/ManageUsers/ManageUserPage";
import { parseJwt } from "./utils/auth";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("store");
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("steam_jwt_token");
    if (token) {
      const payload = parseJwt(token);
      if (payload && payload.exp * 1000 > Date.now()) {
        setUser({
          id: payload.id,
          username: payload.sub,
          email: payload.email,
          role: payload.role || "USER",
        });
      } else {
        localStorage.removeItem("steam_jwt_token");
      }
    }
  }, []);

  const handleAuthSuccess = (data) => {
    localStorage.setItem("steam_jwt_token", data.token);
    setUser({
      id: data.id,
      username: data.username,
      email: data.email,
      role: data.role,
    });
    setActivePage("store");
  };

  const handleLogout = () => {
    localStorage.removeItem("steam_jwt_token");
    setUser(null);
    setActivePage("login");
  };

  const renderPage = () => {
    switch (activePage) {
      case "login":
        return (
          <LoginPage
            onAuthSuccess={handleAuthSuccess}
            onNavigate={setActivePage}
          />
        );
      case "register":
        return (
          <RegisterPage
            onAuthSuccess={handleAuthSuccess}
            onNavigate={setActivePage}
          />
        );
      case "library":
        return <LibraryPage user={user} onNavigate={setActivePage} />;
      case "manage-games":
        return user?.role === "DEVELOPER" ? (
          <DevManageGamesPage />
        ) : (
          <StorePage user={user} />
        );
      case "manage-users":
        return user?.role === "ADMIN" ? (
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
