import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CommerceContext } from "../../components/commerce/context";
import { Modal } from "../../components/commerce/CommerceUI";
import { money, priceOf } from "../../services/currency";
import { promotionApi } from "../../services/promotionApi";
import "../ManageGames/ManageGames.css"; // .genre-heading, .genre-field dùng chung
import "./ManagePromotions.css";

const QUICK_PERCENTS = [10, 20, 30, 50, 70];
const EMPTY = { name: "", discount: "20", game_ids: [], active: false };

/** Giá sau giảm để xem trước trong hộp chọn game; trả null nếu % chưa hợp lệ. */
function previewPrice(price, discount) {
  try {
    return priceOf({ price, promotion_id: "preview" }, [
      { id: "preview", status: "ENABLED", discount: String(discount) },
    ]).final;
  } catch {
    return null;
  }
}

const fold = (text) => text.toLocaleLowerCase("vi");

export default function ManagePromotionsPage() {
  const { user, service } = useContext(CommerceContext);
  const [data, setData] = useState({ promotions: [], games: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [formError, setFormError] = useState("");
  const [gameSearch, setGameSearch] = useState("");
  const pending = useRef(false);
  const active = useRef(true);

  const load = useCallback(async () => {
    const next = await promotionApi.overview();
    if (active.current) setData(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await load();
    } catch (failure) {
      if (active.current) setError(failure.message);
    } finally {
      if (active.current) setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    active.current = true;
    if (user.source === "jwt") {
      load()
        .catch((failure) => active.current && setError(failure.message))
        .finally(() => active.current && setLoading(false));
    }
    return () => {
      active.current = false;
    };
  }, [load, user.source]);

  /** Chạy một thao tác ghi, rồi tải lại danh sách khuyến mãi và giá trong cửa hàng. */
  async function mutate(action, success, close) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFormError("");
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (!active.current) return;
      close?.();
      setNotice(typeof success === "function" ? success(result) : success);
      try {
        await load();
        await service.prepareAccount();
      } catch (failure) {
        if (active.current)
          setError(
            `Đã lưu thay đổi, nhưng chưa tải lại được dữ liệu: ${failure.message}`,
          );
      }
    } catch (failure) {
      if (active.current)
        (editor || deleting ? setFormError : setError)(failure.message);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (user.source !== "jwt")
    return (
      <main className="steam-main-content commerce-page">
        <section className="commerce-panel">
          <h2>Quản lý khuyến mãi</h2>
          <p role="status">
            Vui lòng đăng nhập tài khoản quản trị thật để sử dụng chức năng này.
            Chế độ Demo chưa hỗ trợ.
          </p>
        </section>
      </main>
    );

  const gameById = new Map(data.games.map((game) => [game.id, game]));
  const promotionById = new Map(
    data.promotions.map((promo) => [promo.id, promo]),
  );
  const enabledCount = data.promotions.filter(
    (promo) => promo.status === "ENABLED",
  ).length;

  function openEditor(promotion) {
    setFormError("");
    setGameSearch("");
    setEditor(
      promotion
        ? {
            id: promotion.id,
            name: promotion.name,
            discount: promotion.discount,
            game_ids: [...promotion.game_ids],
            active: false,
          }
        : { ...EMPTY },
    );
  }

  const discountNumber = editor ? Number(editor.discount) : 0;
  const discountValid =
    Number.isInteger(discountNumber) &&
    discountNumber >= 1 &&
    discountNumber <= 99;
  const selectable = (game) =>
    !game.promotion_id || game.promotion_id === editor?.id;
  const visibleGames = editor
    ? data.games.filter((game) => fold(game.title).includes(fold(gameSearch)))
    : [];

  function toggleGame(id) {
    setEditor((current) => ({
      ...current,
      game_ids: current.game_ids.includes(id)
        ? current.game_ids.filter((gameId) => gameId !== id)
        : [...current.game_ids, id],
    }));
  }

  function submit(event) {
    event.preventDefault();
    if (!editor.name.trim())
      return setFormError("Vui lòng nhập tên chương trình.");
    if (!discountValid)
      return setFormError("Phần trăm giảm phải là số nguyên từ 1 đến 99.");
    if (!editor.game_ids.length)
      return setFormError("Hãy chọn ít nhất 1 trò chơi.");
    const body = {
      name: editor.name.trim(),
      discount: discountNumber,
      game_ids: editor.game_ids,
      active: editor.active,
    };
    mutate(
      () =>
        editor.id
          ? promotionApi.update(editor.id, body)
          : promotionApi.create(body),
      (result) =>
        `Đã lưu khuyến mãi.${result?.notified ? ` Đã gửi thông báo cho ${result.notified} lượt yêu thích.` : ""}`,
      () => setEditor(null),
    );
  }

  return (
    <main className="steam-main-content commerce-page promo-page">
      <div className="genre-heading">
        <div>
          <h1>Quản lý khuyến mãi</h1>
          <p className="commerce-note">
            {data.promotions.length} chương trình · {enabledCount} đang kích
            hoạt. Mỗi trò chơi chỉ thuộc một chương trình.
          </p>
        </div>
        <button
          className="commerce-button primary"
          disabled={busy || loading}
          onClick={() => openEditor(null)}
        >
          Tạo khuyến mãi
        </button>
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
            disabled={busy || loading}
            onClick={refresh}
          >
            Tải lại dữ liệu
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Đang tải khuyến mãi…</p>
      ) : data.promotions.length === 0 ? (
        <section className="commerce-panel">
          <p>
            Chưa có chương trình khuyến mãi nào. Bấm “Tạo khuyến mãi” để bắt
            đầu.
          </p>
        </section>
      ) : (
        <ul className="promo-list" aria-busy={busy}>
          {data.promotions.map((promo) => {
            const on = promo.status === "ENABLED";
            const titles = promo.game_ids
              .map((id) => gameById.get(id)?.title)
              .filter(Boolean);
            return (
              <li
                key={promo.id}
                className={`commerce-panel promo-card ${on ? "on" : ""}`}
              >
                <div
                  className="promo-percent"
                  aria-label={`Giảm ${promo.discount} phần trăm`}
                >
                  −{promo.discount}%
                </div>
                <div className="promo-main">
                  <h3>{promo.name}</h3>
                  <small>
                    {promo.game_ids.length} trò chơi ·{" "}
                    {on ? "Đang áp dụng giá giảm" : "Chưa áp dụng (đã tắt)"}
                  </small>
                  <p className="promo-games-line">
                    {titles.slice(0, 6).join(", ")}
                    {titles.length > 6
                      ? ` và ${titles.length - 6} game khác`
                      : ""}
                  </p>
                </div>
                <div className="promo-actions">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Tắt" : "Kích hoạt"} ${promo.name}`}
                    className={`promo-switch ${on ? "on" : ""}`}
                    disabled={busy}
                    onClick={() =>
                      mutate(
                        () =>
                          promotionApi.setStatus(
                            promo.id,
                            on ? "DISABLED" : "ENABLED",
                          ),
                        (result) =>
                          on
                            ? "Đã tắt khuyến mãi. Các game trở về giá gốc."
                            : `Đã kích hoạt khuyến mãi.${result?.notified ? ` Đã gửi thông báo cho ${result.notified} lượt yêu thích.` : ""}`,
                      )
                    }
                  >
                    <span className="promo-switch-knob" aria-hidden="true" />
                    <span>{on ? "Đang kích hoạt" : "Đã tắt"}</span>
                  </button>
                  <button
                    className="commerce-button"
                    disabled={busy}
                    onClick={() => openEditor(promo)}
                  >
                    Sửa
                  </button>
                  <button
                    className="commerce-button danger"
                    disabled={busy}
                    onClick={() => {
                      setFormError("");
                      setDeleting(promo);
                    }}
                  >
                    Xóa
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editor && (
        <Modal
          title={editor.id ? "Sửa khuyến mãi" : "Tạo khuyến mãi"}
          busy={busy}
          error={formError}
          close={() => setEditor(null)}
        >
          <form onSubmit={submit}>
            <label className="genre-field">
              Tên chương trình
              <input
                autoFocus
                required
                maxLength={120}
                value={editor.name}
                disabled={busy}
                placeholder="Ví dụ: Siêu sale cuối tuần"
                onChange={(event) =>
                  setEditor({ ...editor, name: event.target.value })
                }
              />
            </label>
            <div className="genre-field">
              <label htmlFor="promo-percent">Phần trăm giảm (1–99%)</label>
              <div className="promo-percent-row">
                <input
                  id="promo-percent"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  required
                  value={editor.discount}
                  disabled={busy}
                  onChange={(event) =>
                    setEditor({ ...editor, discount: event.target.value })
                  }
                />
                {QUICK_PERCENTS.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={`commerce-button ${Number(editor.discount) === value ? "selected" : ""}`}
                    disabled={busy}
                    onClick={() =>
                      setEditor({ ...editor, discount: String(value) })
                    }
                  >
                    {value}%
                  </button>
                ))}
              </div>
            </div>
            <div className="promo-picker">
              <div className="promo-picker-head">
                <strong>
                  Trò chơi áp dụng ({editor.game_ids.length} đã chọn)
                </strong>
                <span>
                  <button
                    type="button"
                    className="notif-link"
                    disabled={busy}
                    onClick={() =>
                      setEditor((current) => ({
                        ...current,
                        game_ids: [
                          ...new Set([
                            ...current.game_ids,
                            ...visibleGames
                              .filter(selectable)
                              .map((game) => game.id),
                          ]),
                        ],
                      }))
                    }
                  >
                    Chọn tất cả đang hiển thị
                  </button>{" "}
                  <button
                    type="button"
                    className="notif-link"
                    disabled={busy}
                    onClick={() => setEditor({ ...editor, game_ids: [] })}
                  >
                    Bỏ chọn hết
                  </button>
                </span>
              </div>
              <input
                className="commerce-input"
                type="search"
                aria-label="Tìm trò chơi"
                placeholder="Tìm trò chơi…"
                value={gameSearch}
                onChange={(event) => setGameSearch(event.target.value)}
              />
              <ul className="promo-games">
                {visibleGames.length === 0 && (
                  <li className="promo-games-empty">
                    Không có trò chơi phù hợp.
                  </li>
                )}
                {visibleGames.map((game) => {
                  const taken = !selectable(game);
                  const checked = editor.game_ids.includes(game.id);
                  const after =
                    checked && discountValid
                      ? previewPrice(game.price, discountNumber)
                      : null;
                  return (
                    <li key={game.id}>
                      <label className={`promo-game ${taken ? "taken" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy || taken}
                          onChange={() => toggleGame(game.id)}
                        />
                        <span className="promo-game-info">
                          <strong>{game.title}</strong>
                          <small>
                            {game.developer_name}
                            {game.status === "HIDDEN" ? " · Đang ẩn" : ""}
                            {taken
                              ? ` · Đang thuộc “${promotionById.get(game.promotion_id)?.name ?? "khuyến mãi khác"}”`
                              : ""}
                          </small>
                        </span>
                        <span className="promo-game-price">
                          {after ? (
                            <>
                              <del>{money(game.price)}</del>{" "}
                              <strong>{money(after)}</strong>
                            </>
                          ) : (
                            money(game.price)
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            {!editor.id && (
              <label className="promo-activate">
                <input
                  type="checkbox"
                  checked={editor.active}
                  disabled={busy}
                  onChange={(event) =>
                    setEditor({ ...editor, active: event.target.checked })
                  }
                />
                Kích hoạt ngay (người đang yêu thích các game này sẽ nhận thông
                báo)
              </label>
            )}
            <button
              className="commerce-button primary"
              disabled={busy}
              type="submit"
            >
              {busy ? "Đang lưu…" : "Lưu khuyến mãi"}
            </button>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Xóa khuyến mãi?"
          busy={busy}
          error={formError}
          close={() => setDeleting(null)}
        >
          <p>
            Bạn muốn xóa <strong>{deleting.name}</strong>?{" "}
            {deleting.game_ids.length} trò chơi sẽ trở về giá gốc. Thông báo đã
            gửi cho người dùng vẫn được giữ lại.
          </p>
          <button
            className="commerce-button danger"
            disabled={busy}
            onClick={() =>
              mutate(
                () => promotionApi.remove(deleting.id),
                "Đã xóa khuyến mãi.",
                () => setDeleting(null),
              )
            }
          >
            Xác nhận xóa
          </button>
        </Modal>
      )}
    </main>
  );
}
