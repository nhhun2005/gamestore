import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCommerce } from "../../components/commerce/context";
import { Artwork, Modal } from "../../components/commerce/CommerceUI";
import { money } from "../../services/currency";
import { gameApi } from "../../services/gameApi";
import GameEditor from "./GameEditor";
import { decisionLabel, formatDate } from "./gamePresentation";

export function GameHistory({ game }) {
  return (
    <div className="game-history">
      <h3>Lịch sử đơn đăng tải</h3>
      {!game.submissions.length && <p>Chưa gửi đơn đăng tải.</p>}
      {game.submissions.map((s) => (
        <section key={s.id}>
          <strong>{decisionLabel(s.status)}</strong>
          <small>
            Gửi: {formatDate(s.created_at)}
            {s.reviewed_at && ` · Duyệt: ${formatDate(s.reviewed_at)}`}
          </small>
          {s.reviewer_name && <p>Người xét duyệt: {s.reviewer_name}</p>}
          {s.reason && <p className="game-description">Lý do: {s.reason}</p>}
        </section>
      ))}
    </div>
  );
}

export default function GameCatalogPage({ createOnly = false }) {
  const { user, service } = useCommerce();
  const navigate = useNavigate();
  const admin = user.role === "ADMINISTRATOR";
  const [data, setData] = useState({ games: [], genres: [], developers: [] });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState(null);
  const [details, setDetails] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const active = useRef(true),
    pending = useRef(false);
  const load = useCallback(async () => {
    const value = await gameApi.management();
    if (active.current) {
      setData(value);
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    if (user.source === "jwt")
      load()
        .catch((e) => {
          if (active.current) setError(e.message);
        })
        .finally(() => {
          if (active.current) setLoading(false);
        });
    return () => {
      active.current = false;
    };
  }, [load, user.source]);
  async function retry() {
    setLoading(true);
    setError("");
    try {
      await load();
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      if (active.current) setLoading(false);
    }
  }
  async function mutate(action, message, close) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setFormError("");
    setNotice("");
    try {
      const result = await action();
      if (!active.current) return;
      close?.(result);
      setNotice(message);
      try {
        await load();
        await service.prepareAccount();
      } catch (e) {
        if (active.current)
          setError(
            `Đã lưu thay đổi nhưng chưa tải lại được dữ liệu: ${e.message}`,
          );
      }
    } catch (e) {
      if (active.current) {
        if (editor || confirm || createOnly) setFormError(e.message);
        else setError(e.message);
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (user.source !== "jwt")
    return (
      <section className="commerce-panel">
        <h2>Quản lý trò chơi</h2>
        <p>
          Vui lòng đăng nhập tài khoản thật để quản lý trò chơi. Chế độ Demo
          chưa hỗ trợ chức năng này.
        </p>
      </section>
    );
  const managedGames = admin
    ? data.games.filter((game) => !game.has_pending_submission)
    : data.games;
  const games = managedGames.filter(
    (game) =>
      (!status || game.status === status) &&
      game.title
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
  );
  const detailGame = data.games.find((game) => game.id === details);
  return (
    <>
      <div className="genre-heading">
        <h2>
          {createOnly
            ? "Đăng tải trò chơi"
            : admin
              ? "Danh sách trò chơi"
              : "Trò chơi đã đăng tải"}
        </h2>
        {!createOnly &&
          (admin ? (
            <button
              className="commerce-button primary"
              disabled={loading || busy || !loaded}
              onClick={() => {
                setFormError("");
                setEditor({});
              }}
            >
              Thêm trò chơi
            </button>
          ) : (
            <Link className="commerce-button primary" to="/manage-games/new">
              Tạo trò chơi mới
            </Link>
          ))}
      </div>
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
            disabled={loading || busy}
            onClick={retry}
          >
            Tải lại trò chơi
          </button>
        </div>
      )}
      {loading && <p role="status">Đang tải trò chơi…</p>}
      {loaded &&
        !loading &&
        (createOnly ? (
          <section className="commerce-panel">
            <GameEditor
              key="create"
              genres={data.genres}
              developers={data.developers}
              user={user}
              busy={busy}
              error={formError}
              save={(body) =>
                mutate(
                  () => gameApi.save(null, body),
                  "Đã tạo bản nháp.",
                  () => navigate("/manage-games"),
                )
              }
            />
          </section>
        ) : (
          <>
            <div className="game-filters">
              <label className="genre-field">
                Tìm trò chơi
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="genre-field">
                Lọc trạng thái
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="HIDDEN">Đang ẩn</option>
                  <option value="AVAILABLE">Đang phát hành</option>
                </select>
              </label>
            </div>
            {!games.length && (
              <p className="commerce-empty">
                {managedGames.length
                  ? "Không có trò chơi phù hợp."
                  : admin && data.games.some((game) => game.has_pending_submission)
                    ? "Game đang chờ duyệt nằm trong mục Đơn đăng tải trò chơi."
                  : "Chưa có trò chơi. Hãy tạo trò chơi đầu tiên."}
              </p>
            )}
            <div className="game-management-grid">
              {games.map((game) => (
                <article className="commerce-panel managed-game" key={game.id}>
                  <Artwork game={game} />
                  <h3>{game.title}</h3>
                  <p>
                    <span className={`game-status ${game.status}`}>
                      {game.status === "AVAILABLE"
                        ? "Đang phát hành"
                        : "Đang ẩn"}
                    </span>{" "}
                    · {money(game.price)}
                  </p>
                  <p>
                    {game.genre_ids
                      .map((id) => data.genres.find((g) => g.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "Chưa có thể loại"}
                  </p>
                  <small>
                    {game.developer_name} · Phiên bản {game.version || "—"}
                  </small>
                  {game.has_pending_submission && (
                    <p className="game-status">Có đơn đang chờ duyệt</p>
                  )}
                  {!admin &&
                    !game.can_enable &&
                    !game.has_pending_submission && (
                      <p>Cần gửi đơn để được xét duyệt phát hành.</p>
                    )}
                  <div className="genre-actions">
                    <button
                      className="commerce-button"
                      disabled={busy}
                      onClick={() => setDetails(game.id)}
                    >
                      Chi tiết
                    </button>
                    <button
                      className="commerce-button"
                      disabled={busy}
                      aria-label={`Sửa ${game.title}`}
                      onClick={() => {
                        setFormError("");
                        setEditor(game);
                      }}
                    >
                      Sửa
                    </button>
                    {game.status === "AVAILABLE" ? (
                      <button
                        className="commerce-button secondary"
                        disabled={busy}
                        onClick={() => {
                          setFormError("");
                          setConfirm({ game, action: "hide" });
                        }}
                      >
                        Ẩn trò chơi
                      </button>
                    ) : (
                      (admin || game.can_enable) && (
                        <button
                          className="commerce-button"
                          disabled={busy}
                          onClick={() =>
                            mutate(
                              () => gameApi.visibility(game.id, "AVAILABLE"),
                              "Đã phát hành trò chơi.",
                            )
                          }
                        >
                          Bật lại trò chơi
                        </button>
                      )
                    )}
                    {!admin && game.status === "HIDDEN" && !game.can_enable && (
                      <button
                        className="commerce-button primary"
                        disabled={busy || game.has_pending_submission}
                        onClick={() => {
                          setFormError("");
                          setConfirm({ game, action: "submit" });
                        }}
                      >
                        {game.has_pending_submission
                          ? "Đang chờ duyệt"
                          : "Đăng tải trò chơi"}
                      </button>
                    )}
                    {admin && (
                      <button
                        className="commerce-button danger"
                        disabled={busy}
                        aria-label={`Xóa ${game.title}`}
                        onClick={() => {
                          setFormError("");
                          setConfirm({ game, action: "remove" });
                        }}
                      >
                        Xóa trò chơi
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ))}
      {editor && (
        <Modal
          title={editor.id ? "Sửa trò chơi" : "Thêm trò chơi"}
          busy={busy}
          close={() => setEditor(null)}
        >
          <GameEditor
            key={editor.id || "new"}
            game={editor.id ? editor : null}
            genres={data.genres}
            developers={data.developers}
            user={user}
            busy={busy}
            error={formError}
            save={(body) =>
              mutate(
                () => gameApi.save(editor.id, body),
                "Đã lưu trò chơi.",
                () => setEditor(null),
              )
            }
          />
        </Modal>
      )}
      {detailGame && (
        <Modal title={detailGame.title} close={() => setDetails(null)}>
          <Artwork game={detailGame} />
          <p className="game-description">
            {detailGame.description || "Chưa có mô tả."}
          </p>
          <p>
            {money(detailGame.price)} · {detailGame.status}
          </p>
          <GameHistory game={detailGame} />
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === "remove"
              ? "Xóa hoàn toàn trò chơi?"
              : confirm.action === "hide"
                ? "Ẩn trò chơi?"
                : "Gửi đơn đăng tải?"
          }
          busy={busy}
          close={() => setConfirm(null)}
        >
          <p>
            <strong>{confirm.game.title}</strong>
          </p>
          <p>
            {confirm.action === "remove"
              ? "Thao tác sẽ xóa game, thể loại liên kết, wishlist và đơn đăng tải. Game có lịch sử giao dịch hoặc quyền sở hữu sẽ không thể xóa hoàn toàn."
              : confirm.action === "hide"
                ? "Trò chơi sẽ ngừng hiển thị trong cửa hàng. Kết quả duyệt hiện tại được giữ lại."
                : "Gửi nội dung hiện tại cho quản trị viên xét duyệt. Trò chơi chỉ phát hành khi được chấp thuận."}
          </p>
          {formError && (
            <p className="commerce-error" role="alert">
              {formError}
            </p>
          )}
          <button
            className={`commerce-button ${confirm.action === "remove" ? "danger" : "primary"}`}
            disabled={busy}
            onClick={() =>
              mutate(
                () =>
                  confirm.action === "remove"
                    ? gameApi.remove(confirm.game.id)
                    : confirm.action === "hide"
                      ? gameApi.hide(confirm.game.id)
                      : gameApi.submit(confirm.game.id),
                confirm.action === "submit"
                  ? "Đã gửi đơn đăng tải."
                  : confirm.action === "hide"
                    ? "Đã ẩn trò chơi."
                    : "Đã xóa hoàn toàn trò chơi.",
                () => setConfirm(null),
              )
            }
          >
            {confirm.action === "remove"
              ? "Xác nhận xóa hoàn toàn"
              : confirm.action === "hide"
                ? "Xác nhận ẩn"
                : "Xác nhận gửi đơn"}
          </button>
        </Modal>
      )}
    </>
  );
}
