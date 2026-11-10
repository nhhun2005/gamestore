import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCommerce } from "../../components/commerce/context";
import { developerApi } from "../../services/developerApi";
import { statusLabel } from "./developerPresentation";
import "./DeveloperRegistration.css";

export default function DeveloperRegistrationPage() {
  const { user, service } = useCommerce();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);

  const active = useRef(true);
  const sequence = useRef(0);
  const pending = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const items = await developerApi.submissions();
      if (active.current && current === sequence.current) {
        setSubmissions(items || []);
        setError("");
        if (items && items.some((s) => s.status === "ACCEPTED")) {
          await service.prepareAccount();
        }
      }
    } catch (e) {
      if (active.current && current === sequence.current) {
        setError(e.message);
      }
    } finally {
      if (active.current && current === sequence.current) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    active.current = true;
    if (user?.source === "jwt") {
      Promise.resolve().then(load);
    }
    return () => {
      active.current = false;
      invalidate();
    };
  }, [invalidate, load, user?.source]);

  const hasPending = submissions.some((s) => s.status === "PENDING");
  const isDeveloper = user?.role === "DEVELOPER";

  async function handleSubmit(e) {
    e.preventDefault();
    if (pending.current || loading || error || hasPending || isDeveloper) return;

    const trimmed = reason.trim();
    if (!trimmed || trimmed.length < 1) {
      setSubmitError("Vui lòng nhập lý do đăng ký (1-2000 ký tự).");
      return;
    }
    if (trimmed.length > 2000) {
      setSubmitError("Lý do đăng ký tối đa 2000 ký tự.");
      return;
    }

    pending.current = true;
    setBusy(true);
    setSubmitError("");
    setNotice("");

    try {
      const submitted = await developerApi.submit(trimmed);
      if (!active.current) return;
      setSubmissions((items) => [...items, submitted]);
      setReason("");
      setNotice("Đã gửi đơn đăng ký nhà phát triển thành công. Vui lòng chờ xét duyệt.");
      await load();
      try {
        await service.prepareAccount();
      } catch (err) {
        if (active.current) {
          setError(`Đã gửi đơn nhưng chưa làm mới được tài khoản: ${err.message}`);
        }
      }
    } catch (err) {
      if (active.current) {
        setSubmitError(err.message);
      }
    } finally {
      pending.current = false;
      if (active.current) {
        setBusy(false);
      }
    }
  }

  if (user?.source !== "jwt") {
    return (
      <main className="steam-main-content commerce-page developer-registration-page">
        <section className="commerce-panel">
          <h1>Đăng ký Nhà phát triển</h1>
          <p>
            Chế độ Demo không hỗ trợ đăng ký nhà phát triển. Vui lòng đăng nhập bằng tài khoản thật để tiếp tục.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="steam-main-content commerce-page developer-registration-page">
      <div className="commerce-heading">
        <small>CHƯƠNG TRÌNH NHÀ PHÁT TRIỂN</small>
        <h1>Đăng ký trở thành Nhà phát triển</h1>
        <p>Gửi lý do và kế hoạch phát hành game của bạn để ban quản trị xem xét nâng cấp tài khoản.</p>
      </div>

      {isDeveloper && (
        <div className="commerce-notice" role="status">
          Tài khoản của bạn đã là <strong>Nhà phát triển (DEVELOPER)</strong>. Bạn có thể bắt đầu phát hành trò chơi!{" "}
          <Link className="commerce-button" to="/manage-games" style={{ marginLeft: 12 }}>
            Quản lý trò chơi →
          </Link>
        </div>
      )}

      {notice && !isDeveloper && (
        <p className="commerce-notice" role="status">
          {notice}
        </p>
      )}

      {error && (
        <div className="commerce-error" role="alert">
          {error}{" "}
          <button
            className="commerce-button"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            Tải lại
          </button>
        </div>
      )}

      {!isDeveloper && (
        <section className="commerce-panel" style={{ marginBottom: 28 }}>
          <h2>Gửi đơn đăng ký mới</h2>
          {hasPending ? (
            <p className="commerce-notice" role="status">
              Bạn hiện đang có một đơn đăng ký ở trạng thái <strong>Chờ duyệt</strong>. Vui lòng đợi quản trị viên xét duyệt trước khi gửi đơn mới.
            </p>
          ) : (
            <form onSubmit={handleSubmit}>
              <label className="genre-field">
                Lý do đăng ký và giới thiệu về studio / kế hoạch phát hành (tối đa 2000 ký tự)
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ví dụ: Chúng tôi là indie game studio phát triển game nhập vai hành động..."
                  required
                  disabled={busy || loading || Boolean(error)}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <small style={{ color: reason.length > 2000 ? "#ff8080" : "#a9bfce" }}>
                  {reason.length}/2000 ký tự
                </small>
                <button
                  className="commerce-button"
                  type="submit"
                  disabled={busy || loading || Boolean(error) || !reason.trim() || reason.trim().length > 2000}
                >
                  {busy ? "Đang gửi đơn…" : "Gửi đơn đăng ký"}
                </button>
              </div>
              {submitError && (
                <p className="commerce-error" role="alert" style={{ marginTop: 12 }}>
                  {submitError}
                </p>
              )}
            </form>
          )}
        </section>
      )}

      <section className="commerce-panel">
        <div className="genre-actions">
          <h2>Lịch sử đơn đăng ký</h2>
          <button className="commerce-button" disabled={loading || busy} onClick={() => { setNotice(""); setLoading(true); load(); }}>
            Làm mới trạng thái
          </button>
        </div>
        {loading ? (
          <p role="status">Đang tải lịch sử đơn đăng ký…</p>
        ) : submissions.length === 0 ? (
          <p className="commerce-empty">Bạn chưa gửi đơn đăng ký nào.</p>
        ) : (
          <ul className="submission-list">
            {submissions.map((sub) => (
              <li className="commerce-panel" key={sub.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Mã đơn: {sub.id}</h3>
                  <span className={`developer-status-badge status-${sub.status}`}>
                    {statusLabel(sub.status)}
                  </span>
                </div>
                <div className="game-description" style={{ marginTop: 12 }}>
                  <strong>Lý do đăng ký:</strong>
                  <p style={{ margin: "4px 0 0 0" }}>{sub.application_reason || "Đơn cũ chưa lưu lời đăng ký."}</p>
                </div>
                {sub.reason && (
                  <div className="developer-feedback-box" style={{ marginTop: 12 }}>
                    <strong>Phản hồi từ Quản trị viên:</strong>
                    <p style={{ margin: "4px 0 0 0" }}>{sub.reason}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
