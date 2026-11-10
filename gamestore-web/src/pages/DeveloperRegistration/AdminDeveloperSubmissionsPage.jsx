import { useCallback, useEffect, useRef, useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import { Modal } from "../../components/commerce/CommerceUI";
import { developerApi } from "../../services/developerApi";
import { statusLabel } from "./developerPresentation";
import "./DeveloperRegistration.css";

export default function AdminDeveloperSubmissionsPage() {
  const { user } = useCommerce();
  const [filter, setFilter] = useState({ status: "PENDING", q: "", page: 0 });
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ items: [], total: 0, page: 0, size: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);
  const [decision, setDecision] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const pending = useRef(false), active = useRef(true), sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const res = await developerApi.adminSubmissions({
        status: filter.status,
        q: filter.q,
        page: filter.page,
        size: 20,
      });
      if (active.current && current === sequence.current) {
        setData(res || { items: [], total: 0, page: 0, size: 20 });
        setError("");
      }
    } catch (err) {
      if (active.current && current === sequence.current) setError(err.message);
    } finally {
      if (active.current && current === sequence.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    active.current = true;
    if (user?.source === "jwt") Promise.resolve().then(load);
    return () => {
      active.current = false;
      invalidate();
    };
  }, [invalidate, load, user?.source]);

  function changeFilter(updates) {
    setLoading(true);
    sequence.current++;
    setFilter((prev) => ({ ...prev, ...updates }));
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    changeFilter({ q: search.trim(), page: 0 });
  }

  function openReview(item) {
    setReviewItem(item);
    setDecision("");
    setReviewReason("");
    setReviewError("");
  }

  function closeReview() {
    if (!busy) {
      setReviewItem(null);
      setReviewError("");
    }
  }

  async function handleReviewSubmit(e) {
    e.preventDefault();
    if (pending.current || !reviewItem || !decision) return;
    const trimmed = reviewReason.trim();
    if (!trimmed) return setReviewError("Vui lòng nhập phản hồi của quản trị viên.");
    if (trimmed.length > 2000) return setReviewError("Phản hồi tối đa 2000 ký tự.");
    pending.current = true;
    setBusy(true);
    setReviewError("");
    try {
      await developerApi.review(reviewItem.id, decision, trimmed);
      if (!active.current) return;
      setReviewItem(null);
      setNotice(`Đã xét duyệt đơn đăng ký của ${reviewItem.username}.`);
      await load();
    } catch (err) {
      if (active.current) setReviewError(err.message);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (user?.source !== "jwt") {
    return (
      <main className="steam-main-content commerce-page developer-registration-page">
        <section className="commerce-panel">
          <h1>Xét duyệt đăng ký nhà phát triển</h1>
          <p>Chế độ Demo không hỗ trợ xét duyệt nhà phát triển. Vui lòng đăng nhập bằng tài khoản quản trị thật để tiếp tục.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="steam-main-content commerce-page developer-registration-page">
      <h1>Xét duyệt đăng ký nhà phát triển</h1>
      <form className="game-filters" onSubmit={handleSearchSubmit}>
        <label className="genre-field">
          Tìm tài khoản
          <input type="search" maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)} disabled={busy} placeholder="Nhập tên tài khoản…" />
        </label>
        <label className="genre-field">
          Lọc trạng thái
          <select value={filter.status} onChange={(e) => changeFilter({ status: e.target.value, page: 0 })} disabled={busy}>
            <option value="">Tất cả</option>
            <option value="PENDING">Chờ duyệt</option>
            <option value="ACCEPTED">Đã chấp thuận</option>
            <option value="REJECTED">Bị từ chối</option>
          </select>
        </label>
        <button className="commerce-button" type="submit" disabled={busy}>Tìm kiếm</button>
      </form>
      {notice && <p className="commerce-notice" role="status">{notice}</p>}
      {error && (
        <div className="commerce-error" role="alert">
          {error} <button className="commerce-button" disabled={loading || busy} onClick={() => { setLoading(true); load(); }}>Thử lại</button>
        </div>
      )}
      {loading ? (
        <p role="status">Đang tải danh sách đơn đăng ký…</p>
      ) : data.items.length === 0 ? (
        <p className="commerce-empty">Không có đơn đăng ký phù hợp.</p>
      ) : (
        <>
          <p>{data.total} đơn đăng ký · Trang {data.page + 1}</p>
          <ul className="submission-list">
            {data.items.map((sub) => (
              <li className="commerce-panel" key={sub.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <h3 style={{ margin: 0 }}>Tài khoản: {sub.username}</h3>
                  <span className={`developer-status-badge status-${sub.status}`}>{statusLabel(sub.status)}</span>
                </div>
                <div className="game-description" style={{ marginTop: 12 }}>
                  <strong>Lý do đăng ký:</strong>
                  <p style={{ margin: "4px 0 0 0" }}>{sub.application_reason || "Không có lý do đăng ký (dữ liệu cũ)."}</p>
                </div>
                {sub.reason && (
                  <div className="developer-feedback-box" style={{ marginTop: 12 }}>
                    <strong>Phản hồi của quản trị viên:</strong>
                    <p style={{ margin: "4px 0 0 0" }}>{sub.reason}</p>
                  </div>
                )}
                {sub.status === "PENDING" && (
                  <div className="genre-actions" style={{ marginTop: 14 }}>
                    <button className="commerce-button" disabled={busy} onClick={() => openReview(sub)}>Xét duyệt</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="genre-actions">
        <button className="commerce-button" disabled={loading || busy || filter.page === 0} onClick={() => changeFilter({ page: filter.page - 1 })}>
          Trang trước
        </button>
        <button className="commerce-button" disabled={loading || busy || (filter.page + 1) * data.size >= data.total} onClick={() => changeFilter({ page: filter.page + 1 })}>
          Trang sau
        </button>
      </div>
      {reviewItem && (
        <Modal title={`Xét duyệt đơn: ${reviewItem.username}`} close={closeReview} busy={busy} error={reviewError}>
          <div style={{ marginBottom: 16 }}>
            <strong>Lý do đăng ký của người dùng:</strong>
            <p style={{ margin: "4px 0 0 0", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {reviewItem.application_reason || "Không có lý do đăng ký (dữ liệu cũ)."}
            </p>
          </div>
          <form onSubmit={handleReviewSubmit}>
            <label className="genre-field">
              Quyết định
              <select aria-label="Quyết định" value={decision} onChange={(e) => setDecision(e.target.value)} disabled={busy} required>
                <option value="">Chọn quyết định</option>
                <option value="ACCEPTED">Chấp thuận</option>
                <option value="REJECTED">Từ chối</option>
              </select>
            </label>
            <label className="genre-field">
              Phản hồi của quản trị viên
              <textarea required rows={4} maxLength={2000} value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="Nhập phản hồi hoặc lý do xét duyệt…" disabled={busy} />
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <small style={{ color: reviewReason.length > 2000 ? "#ff8080" : "#a9bfce" }}>{reviewReason.length}/2000 ký tự</small>
              <button className="commerce-button" type="submit" disabled={busy || !decision || !reviewReason.trim() || reviewReason.trim().length > 2000}>
                Xác nhận xét duyệt
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
