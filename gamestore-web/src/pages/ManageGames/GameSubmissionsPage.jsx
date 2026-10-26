import { useCallback, useEffect, useRef, useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import { Artwork, Modal } from "../../components/commerce/CommerceUI";
import { money } from "../../services/currency";
import { gameApi } from "../../services/gameApi";
import { decisionLabel, formatDate } from "./gamePresentation";

export default function GameSubmissionsPage() {
  const { user, service } = useCommerce();
  const [filter, setFilter] = useState({ status: "PENDING", q: "", page: 0 });
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ items: [], total: 0, page: 0, size: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [game, setGame] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [decision, setDecision] = useState("");
  const pending = useRef(false),
    active = useRef(true),
    sequence = useRef(0),
    detailSequence = useRef(0);
  const invalidate = useCallback(() => {
    sequence.current++;
    detailSequence.current++;
  }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await gameApi.submissions(filter);
      if (active.current && current === sequence.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (active.current && current === sequence.current) setError(e.message);
    } finally {
      if (active.current && current === sequence.current) setLoading(false);
    }
  }, [filter]);
  useEffect(() => {
    active.current = true;
    if (user.source === "jwt") Promise.resolve().then(load);
    return () => {
      active.current = false;
      invalidate();
    };
  }, [invalidate, load, user.source]);
  function change(next) {
    setLoading(true);
    setFilter((current) => ({ ...current, ...next }));
  }
  async function open(submission) {
    setReview(submission);
    setGame(null);
    setReviewError("");
    setReason("");
    setDecision("");
    setDetailLoading(true);
    const current = ++detailSequence.current;
    try {
      const next = await gameApi.get(submission.game_id);
      if (active.current && detailSequence.current === current) setGame(next);
    } catch (e) {
      if (active.current && detailSequence.current === current)
        setReviewError(e.message);
    } finally {
      if (active.current && detailSequence.current === current)
        setDetailLoading(false);
    }
  }
  async function submit() {
    if (pending.current || !decision) return;
    if (!reason.trim()) {
      setReviewError("Vui lòng nhập lý do duyệt hoặc từ chối.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setReviewError("");
    setNotice("");
    try {
      await gameApi.review(review.id, decision, reason.trim());
      if (!active.current) return;
      setReview(null);
      setNotice(
        decision === "ACCEPTED"
          ? "Đã duyệt đơn và phát hành trò chơi."
          : "Đã từ chối đơn đăng tải.",
      );
      await load();
      try {
        await service.prepareAccount();
      } catch (e) {
        if (active.current)
          setError(
            `Đã xử lý đơn nhưng chưa tải lại được cửa hàng: ${e.message}`,
          );
      }
    } catch (e) {
      if (active.current) setReviewError(e.message);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (user.source !== "jwt")
    return (
      <section className="commerce-panel">
        <h2>Đơn đăng tải trò chơi</h2>
        <p>
          Vui lòng đăng nhập tài khoản quản trị thật để xem và xét duyệt đơn.
        </p>
      </section>
    );
  return (
    <>
      <h2>Đơn đăng tải trò chơi</h2>
      <form
        className="game-filters"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: search.trim(), page: 0 });
        }}
      >
        <label className="genre-field">
          Tìm đơn theo game hoặc developer
          <input
            maxLength={200}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="genre-field">
          Lọc trạng thái đơn
          <select
            value={filter.status}
            onChange={(e) => change({ status: e.target.value, page: 0 })}
          >
            <option value="PENDING">Chờ duyệt</option>
            <option value="ACCEPTED">Đã duyệt</option>
            <option value="REJECTED">Bị từ chối</option>
            <option value="">Tất cả</option>
          </select>
        </label>
        <button className="commerce-button" type="submit">
          Tìm đơn
        </button>
      </form>
      {notice && (
        <p className="commerce-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="commerce-error" role="alert">
          {error}{" "}
          <button
            className="commerce-button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            Tải lại đơn
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Đang tải đơn đăng tải…</p>
      ) : !data.items.length ? (
        <p className="commerce-empty">Không có đơn phù hợp.</p>
      ) : (
        <>
          <p>
            {data.total} đơn · Trang {data.page + 1}
          </p>
          <ul className="submission-list">
            {data.items.map((submission) => (
              <li className="commerce-panel" key={submission.id}>
                <h3>{submission.game_title}</h3>
                <p>
                  {submission.submitter_name} ·{" "}
                  {decisionLabel(submission.status)}
                </p>
                <small>Gửi lúc {formatDate(submission.created_at)}</small>
                {submission.reason && (
                  <p className="game-description">Lý do: {submission.reason}</p>
                )}
                <button
                  className="commerce-button"
                  disabled={busy}
                  onClick={() => open(submission)}
                >
                  Xem đơn
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="genre-actions">
        <button
          className="commerce-button"
          disabled={loading || busy || filter.page === 0}
          onClick={() => change({ page: filter.page - 1 })}
        >
          Trang trước
        </button>
        <button
          className="commerce-button"
          disabled={
            loading || busy || (filter.page + 1) * data.size >= data.total
          }
          onClick={() => change({ page: filter.page + 1 })}
        >
          Trang sau
        </button>
      </div>
      {review && (
        <Modal
          title={`Đơn đăng tải: ${review.game_title}`}
          busy={busy}
          close={() => {
            detailSequence.current++;
            setReview(null);
          }}
        >
          <p>
            {review.submitter_name} · {decisionLabel(review.status)}
          </p>
          {detailLoading && <p role="status">Đang tải nội dung trò chơi…</p>}
          {game && (
            <>
              <Artwork game={game} />
              <h3>{game.title}</h3>
              <p className="game-description">
                {game.description || "Chưa có mô tả."}
              </p>
              <p>
                {money(game.price)} · Phiên bản {game.version || "—"}
              </p>
            </>
          )}
          {review.reason && (
            <p className="game-description">Lý do: {review.reason}</p>
          )}
          {review.reviewer_name && (
            <p>
              Người xét duyệt: {review.reviewer_name} ·{" "}
              {formatDate(review.reviewed_at)}
            </p>
          )}
          {review.status === "PENDING" && game && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="genre-field">
                Lý do duyệt hoặc từ chối
                <textarea
                  required
                  maxLength={2000}
                  rows={4}
                  disabled={busy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="genre-field">
                Quyết định
                <select
                  aria-label="Quyết định"
                  required
                  value={decision}
                  disabled={busy}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  <option value="">Chọn quyết định</option>
                  <option value="ACCEPTED">Duyệt và phát hành</option>
                  <option value="REJECTED">Từ chối</option>
                </select>
              </label>
              {reviewError && (
                <p className="commerce-error" role="alert">
                  {reviewError}
                </p>
              )}
              <button
                className="commerce-button primary"
                disabled={busy || !decision}
                type="submit"
              >
                {busy ? "Đang xử lý…" : "Xác nhận xét duyệt"}
              </button>
            </form>
          )}
          {reviewError && (review.status !== "PENDING" || !game) && (
            <p className="commerce-error" role="alert">
              {reviewError}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
