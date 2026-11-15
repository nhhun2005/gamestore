import { useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import StorePage from "./pages/Store/StorePage";
import GameDetailsPage from "./pages/GameDetails/GameDetailsPage";
import LibraryPage from "./pages/Library/LibraryPage";
import LoginPage from "./pages/Login/LoginPage";
import RegisterPage from "./pages/Register/RegisterPage";
import DevManageGamesPage from "./pages/DevManageGames/DevManageGamesPage";
import ManageUsersPage from "./pages/ManageUsers/ManageUsersPage";
import ManageGamesPage from "./pages/ManageGames/ManageGamesPage";
import GameCatalogPage from "./pages/ManageGames/GameCatalogPage";
import GameSubmissionsPage from "./pages/ManageGames/GameSubmissionsPage";
import ManageGenresPage from "./pages/ManageGames/ManageGenresPage";
import ManagePromotionsPage from "./pages/ManagePromotions/ManagePromotionsPage";
import WishlistPage from "./pages/Wishlist/WishlistPage";
import WalletPage from "./pages/Wallet/WalletPage";
import TransactionsPage from "./pages/Transactions/TransactionsPage";
import RevenuePage from "./pages/Revenue/RevenuePage";
import GameStorePayPage from "./pages/Checkout/GameStorePayPage";
import DeveloperRegistrationPage from "./pages/DeveloperRegistration/DeveloperRegistrationPage";
import AdminDeveloperSubmissionsPage from "./pages/DeveloperRegistration/AdminDeveloperSubmissionsPage";
import VerifyEmailPage from "./pages/VerifyEmail/VerifyEmailPage";
import { session, demoUsers } from "./services/session";
import { commerceGateway as commerceService } from "./services/commerceGateway";
import { CommerceContext } from "./components/commerce/context";
import { money } from "./services/currency";
import "./App.css";
import "./commerce.css";

const homePath = (user) => user?.role === "ADMINISTRATOR" ? "/admin/revenue" : "/store";
const consumerPath = (path) => /^\/(store|library|wishlist)(\/|$)/.test(path) || path.startsWith("/games/");
const returnPath = (path, user) =>
  typeof path === "string" &&
  path.startsWith("/") &&
  !path.startsWith("//") &&
  !(user?.role === "ADMINISTRATOR" && consumerPath(path)) &&
  !["/login", "/register", "/demo", "/verify"].includes(path)
    ? path
    : homePath(user);
function Application() {
  const user = useSyncExternalStore(session.subscribe, session.snapshot);
  const state = useSyncExternalStore(
    commerceService.subscribe,
    commerceService.snapshot,
  );
  const [notice, setNotice] = useState("");
  const [accountError, setAccountError] = useState("");
  const [explicitLogout, setExplicitLogout] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let active = true;
    if (user)
      commerceService
        .prepareAccount()
        .then(() => {
          if (active) setAccountError("");
        })
        .catch((error) => {
          if (active) setAccountError(error.message);
        });
    return () => {
      active = false;
    };
  }, [user, location.pathname]);
  const pendingCheckouts = (state.checkout_sessions || []).filter(
    (c) => c.status === "PENDING",
  );
  const pendingTimes = pendingCheckouts
    .map((c) => Date.parse(c.expires_at))
    .filter(Number.isFinite);
  const hasPendingCheckout = pendingCheckouts.length > 0;
  const nextCheckoutExpiry = pendingTimes.length
    ? Math.min(...pendingTimes)
    : null;
  useEffect(() => {
    if (user?.source !== "jwt") return;
    let active = true,
      refreshing = false;
    const refresh = () => {
      if (!active || refreshing || document.visibilityState === "hidden")
        return;
      refreshing = true;
      commerceService
        .prepareAccount()
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    const poll = hasPendingCheckout ? setInterval(refresh, 15000) : null;
    const expiry =
      nextCheckoutExpiry === null
        ? null
        : setTimeout(
            refresh,
            Math.min(
              2147483647,
              Math.max(0, nextCheckoutExpiry - Date.now() + 150),
            ),
          );
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(poll);
      clearTimeout(expiry);
    };
  }, [user?.id, user?.source, hasPendingCheckout, nextCheckoutExpiry]);
  useEffect(() => {
    if (!user?.expiresAt) return;
    const timer = setInterval(() => {
      if (Date.now() >= user.expiresAt) {
        session.logout();
        setNotice("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [user]);
  const navigatePage = (page) =>
    navigate(`/${page}`, { state: location.state });
  const authSuccess = (data) => {
    session.login(data);
    const destination = explicitLogout
      ? homePath(session.snapshot())
      : returnPath(location.state?.from, session.snapshot());
    setExplicitLogout(false);
    setAccountError("");
    setNotice("");
    navigate(destination, { replace: true });
  };
  const logout = () => {
    // Publish the redirect intent before the external session store notifies guards.
    flushSync(() => setExplicitLogout(true));
    session.logout();
    setNotice("");
    navigate("/login", { replace: true, state: { from: "/store" } });
  };
  function protectedPage(element, role) {
    if (!user)
      return (
        <Navigate
          to="/login"
          state={{
            from: explicitLogout ? "/store" : location.pathname,
          }}
          replace
        />
      );
    if (user.role === "ADMINISTRATOR" && consumerPath(location.pathname))
      return <Navigate to={homePath(user)} replace />;
    if (role && !(Array.isArray(role) ? role : [role]).includes(user.role))
      return (
        <main className="steam-main-content commerce-page">
          <h1>Không có quyền truy cập</h1>
          <p>
            Trang này dành cho {Array.isArray(role) ? role.join(", ") : role}.
          </p>
          <Link to={homePath(user)}>Về trang chính</Link>
        </main>
      );
    if (accountError)
      return (
        <main className="steam-main-content commerce-page">
          <p role="alert" className="commerce-error">
            {accountError}
          </p>
          <button
            className="commerce-button"
            onClick={() => {
              setAccountError("");
              commerceService
                .prepareAccount()
                .catch((error) => setAccountError(error.message));
            }}
          >
            Thử lại
          </button>
        </main>
      );
    if (!state.users.some((u) => u.id === user.id))
      return (
        <p className="commerce-loading" role="status">
          Đang tải dữ liệu tài khoản…
        </p>
      );
    return element;
  }
  const authPage = (registration) =>
    user ? (
      <Navigate to={returnPath(location.state?.from, user)} replace />
    ) : (
      <>
        <div className="auth-notice" role="status">
          {notice}
        </div>
        {registration ? (
          <RegisterPage onAuthSuccess={authSuccess} onNavigate={navigatePage} />
        ) : (
          <LoginPage onAuthSuccess={authSuccess} onNavigate={navigatePage} />
        )}
      </>
    );
  const demoPage =
    user?.source === "jwt" ? (
      <Navigate to={homePath(user)} replace />
    ) : (
      <main className="steam-main-content commerce-page">
        <section className="commerce-panel demo-selector">
          <small>CHỈ DÀNH CHO PHÁT TRIỂN</small>
          <h1>Trải nghiệm Demo</h1>
          <p>
            Danh tính giả lập để thử các luồng. Không thay đổi JWT và không tạo
            tài khoản thật.
          </p>
          <div className="demo-options">
            {demoUsers.map((fixture) => (
              <button
                className="commerce-button"
                key={fixture.id}
                onClick={() => {
                  session.demo(fixture.id);
                  setNotice("");
                  navigate(returnPath(location.state?.from, fixture));
                }}
              >
                <strong>{fixture.username}</strong>
                <small>{fixture.role}</small>
              </button>
            ))}
          </div>
          <Link
            to="/login"
            onClick={() => {
              if (user?.source === "demo") session.logout();
            }}
          >
            Đăng nhập bằng tài khoản thật
          </Link>
        </section>
      </main>
    );
  const account = state.users.find((u) => u.id === user?.id);
  return (
    <CommerceContext.Provider
      value={{ user, state, service: commerceService, notify: setNotice }}
    >
      {user && (
        <Navbar
          user={user}
          activePage={
            location.pathname.startsWith("/games/")
              ? "store"
              : location.pathname.slice(1)
          }
          onNavigate={navigatePage}
          onLogout={logout}
          balance={account ? money(account.balance) : undefined}
        />
      )}
      {notice && user && (
        <p className="commerce-notice app-toast" role="status">
          {notice}
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </p>
      )}
      <div key={user?.id || "anonymous"} className="application-content">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={user ? homePath(user) : "/login"} replace />}
          />
          <Route path="/login" element={authPage(false)} />
          <Route path="/register" element={authPage(true)} />
          <Route
            path="/verify"
            element={<VerifyEmailPage onNavigate={navigatePage} />}
          />
          {import.meta.env.DEV && <Route path="/demo" element={demoPage} />}
          <Route
            path="/store"
            element={protectedPage(
              <StorePage
                user={user}
                games={state.games}
                promotions={state.promotions}
              />,
              undefined,
              false,
            )}
          />
          <Route
            path="/games/:gameId"
            element={protectedPage(<GameDetailsPage />)}
          />
          <Route path="/wallet" element={protectedPage(<WalletPage />)} />
          <Route
            path="/checkout/:id"
            element={protectedPage(<GameStorePayPage />)}
          />
          <Route
            path="/transactions"
            element={protectedPage(<TransactionsPage />)}
          />
          <Route
            path="/library"
            element={protectedPage(
              <LibraryPage user={user} onNavigate={navigatePage} />,
            )}
          />
          <Route path="/wishlist" element={protectedPage(<WishlistPage />)} />
          <Route
            path="/developer/register"
            element={protectedPage(<DeveloperRegistrationPage />, [
              "USER",
              "DEVELOPER",
            ])}
          />
          <Route
            path="/admin/developers"
            element={protectedPage(
              <AdminDeveloperSubmissionsPage />,
              "ADMINISTRATOR",
            )}
          />
          <Route
            path="/developer/revenue"
            element={protectedPage(<RevenuePage />, "DEVELOPER")}
          />
          <Route
            path="/admin/revenue"
            element={protectedPage(<RevenuePage />, "ADMINISTRATOR")}
          />
          <Route
            path="/admin/promotions"
            element={protectedPage(<ManagePromotionsPage />, "ADMINISTRATOR")}
          />
          <Route
            path="/manage-games"
            element={protectedPage(<DevManageGamesPage />, "DEVELOPER", false)}
          >
            <Route index element={<GameCatalogPage />} />
            <Route path="new" element={<GameCatalogPage createOnly />} />
          </Route>
          <Route
            path="/admin/games"
            element={protectedPage(<ManageGamesPage />, "ADMINISTRATOR")}
          >
            <Route index element={<GameCatalogPage />} />
            <Route path="genres" element={<ManageGenresPage />} />
            <Route path="submissions" element={<GameSubmissionsPage />} />
          </Route>
          <Route
            path="/manage-users"
            element={protectedPage(
              <ManageUsersPage user={user} />,
              "ADMINISTRATOR",
              false,
            )}
          />
          <Route
            path="*"
            element={
              <main className="steam-main-content commerce-page">
                <h1>Không tìm thấy trang</h1>
                <Link to="/">Về trang chính</Link>
              </main>
            }
          />
        </Routes>
      </div>
      {user && (
        <footer className="commerce-footer">
          <strong>GAME STORE</strong>
          <span>GameStore · Dự án Bảo trì phần mềm</span>
          <Link to={homePath(user)}>{user.role === "ADMINISTRATOR" ? "Về quản trị ↑" : "Về cửa hàng ↑"}</Link>
        </footer>
      )}
    </CommerceContext.Provider>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <Application />
    </BrowserRouter>
  );
}
