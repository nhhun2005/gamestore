import { useEffect, useState, useSyncExternalStore } from "react";
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
import LibraryPage from "./pages/Library/LibraryPage";
import LoginPage from "./pages/Login/LoginPage";
import RegisterPage from "./pages/Register/RegisterPage";
import DevManageGamesPage from "./pages/DevManageGames/DevManageGamesPage";
import ManageUsersPage from "./pages/ManageUsers/ManageUsersPage";
import WalletPage from "./pages/Wallet/WalletPage";
import TransactionsPage from "./pages/Transactions/TransactionsPage";
import RevenuePage from "./pages/Revenue/RevenuePage";
import { session, demoUsers } from "./services/session";
import { commerceService } from "./services/commerceService";
import { CommerceContext } from "./components/commerce/context";
import { Modal } from "./components/commerce/CommerceUI";
import { useOperation } from "./components/commerce/useOperation";
import { money } from "./services/currency";
import "./App.css";
import "./commerce.css";

const returnPath = (path) =>
  typeof path === "string" &&
  path.startsWith("/") &&
  !path.startsWith("//") &&
  !["/login", "/register", "/demo"].includes(path)
    ? path
    : "/store";
function Application() {
  const user = useSyncExternalStore(session.subscribe, session.snapshot);
  const state = useSyncExternalStore(
    commerceService.subscribe,
    commerceService.snapshot,
  );
  const [notice, setNotice] = useState("");
  const [accountError, setAccountError] = useState("");
  const [reset, setReset] = useState(false);
  const operation = useOperation();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (user && import.meta.env.DEV)
      commerceService
        .prepareAccount()
        .catch((error) => setAccountError(error.message));
  }, [user]);
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
    setAccountError("");
    setNotice("");
    navigate(returnPath(location.state?.from), { replace: true });
  };
  const logout = () => {
    session.logout();
    setNotice("");
    setReset(false);
    navigate("/login", { replace: true });
  };
  function protectedPage(element, role, commerce = true) {
    if (!user)
      return (
        <Navigate to="/login" state={{ from: location.pathname }} replace />
      );
    if (role && user.role !== role)
      return (
        <main className="steam-main-content commerce-page">
          <h1>Không có quyền truy cập</h1>
          <p>Trang này dành cho {role}.</p>
          <Link to="/store">Về cửa hàng</Link>
        </main>
      );
    if (commerce && !import.meta.env.DEV)
      return (
        <main className="steam-main-content commerce-page">
          <h1>Đang tích hợp API thương mại</h1>
          <p>
            Phiên đăng nhập thật của bạn đang hoạt động. Ví, thư viện và doanh
            thu cần API backend; dữ liệu mô phỏng chỉ bật trên dev server.
          </p>
        </main>
      );
    if (commerce && accountError)
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
    if (import.meta.env.DEV && !state.users.some((u) => u.id === user.id))
      return (
        <p className="commerce-loading" role="status">
          Đang tải dữ liệu thương mại mô phỏng…
        </p>
      );
    return element;
  }
  const authPage = (registration) =>
    user ? (
      <Navigate to={returnPath(location.state?.from)} replace />
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
        {import.meta.env.DEV && (
          <div className="dev-auth-entry">
            <Link to="/demo" state={location.state}>
              Thử Demo khi backend chưa sẵn sàng →
            </Link>
          </div>
        )}
      </>
    );
  const demoPage =
    user?.source === "jwt" ? (
      <Navigate to="/store" replace />
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
                  navigate(returnPath(location.state?.from));
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
          activePage={location.pathname.slice(1)}
          onNavigate={navigatePage}
          onLogout={logout}
          balance={
            import.meta.env.DEV ? money(account?.balance || "0") : undefined
          }
        />
      )}
      {user && import.meta.env.DEV && (
        <div className="commerce-demo-bar">
          <div>
            <span>
              {user.source === "demo"
                ? "DEMO"
                : "TÀI KHOẢN THẬT · THƯƠNG MẠI MÔ PHỎNG"}{" "}
              · Không có thanh toán thật
            </span>
            <div>
              {user.source === "demo" && <Link to="/demo">Đổi danh tính</Link>}
              <button disabled={operation.busy} onClick={() => setReset(true)}>
                Đặt lại dữ liệu
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && user && (
        <p className="commerce-notice" role="status">
          {notice}
        </p>
      )}
      <div key={user?.id || "anonymous"} className="application-content">
        <Routes>
          <Route
            path="/"
            element={<Navigate to={user ? "/store" : "/login"} replace />}
          />
          <Route path="/login" element={authPage(false)} />
          <Route path="/register" element={authPage(true)} />
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
          <Route path="/wallet" element={protectedPage(<WalletPage />)} />
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
          <Route
            path="/developer/revenue"
            element={protectedPage(<RevenuePage />, "DEVELOPER")}
          />
          <Route
            path="/admin/revenue"
            element={protectedPage(<RevenuePage />, "ADMINISTRATOR")}
          />
          <Route
            path="/manage-games"
            element={protectedPage(<DevManageGamesPage />, "DEVELOPER", false)}
          />
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
          <strong>STEAM STORE</strong>
          <span>GameStore · Dự án Bảo trì phần mềm</span>
          <Link to="/store">Về cửa hàng ↑</Link>
        </footer>
      )}
      {reset && user && (
        <Modal
          title="Đặt lại dữ liệu mô phỏng?"
          close={() => setReset(false)}
          {...operation}
        >
          <p>
            Đặt lại ví, giao dịch, thư viện và đánh giá mô phỏng của mọi tài
            khoản. JWT và dữ liệu backend được giữ nguyên.
          </p>
          <button
            className="commerce-button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => commerceService.reset(),
                () => {
                  setReset(false);
                  setNotice("Đã đặt lại dữ liệu mô phỏng.");
                },
              )
            }
          >
            Xác nhận đặt lại
          </button>
        </Modal>
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
