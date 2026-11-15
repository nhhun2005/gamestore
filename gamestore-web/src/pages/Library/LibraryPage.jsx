import { useState } from "react";
import { Link } from "react-router-dom";
import { downloadGame } from "../../services/gameDownload";
import { useCommerce } from "../../components/commerce/context";
import { Artwork, EmptyState } from "../../components/commerce/CommerceUI";
import ReviewDialog from "../Reviews/ReviewDialog";
import ReviewList from "../Reviews/ReviewList";
import "./LibraryPage.css";
import {
  CollectionDialog,
  AddCollectionGameDialog,
  LibraryNoteDialog,
} from "./LibraryDialogs";
import { useOperation } from "../../components/commerce/useOperation";
export default function LibraryPage({ user }) {
  const { state, service, notify } = useCommerce();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [reviewed, setReviewed] = useState(false);
  const [selection, setSelection] = useState("");
  const [dialog, setDialog] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [visibility, setVisibility] = useState("visible");
  const setNotice = notify;
  const operation = useOperation();
  const personal = (row) => !row.user_id || row.user_id === user.id;
  const collections = (state.library?.collections || [])
    .filter(personal)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const memberships = (state.library?.memberships || []).filter(personal);
  const preferences = (state.library?.preferences || []).filter(personal);
  const collection = collections.find((entry) => entry.id === collectionId);
  const preferenceOf = (id) =>
    preferences.find((entry) => entry.game_id === id) || {
      note: "",
      hidden: false,
    };
  const ownerships = state.game_bought.filter((p) => p.user_id === user.id);
  const dateOf = (id) =>
    state.transactions.find(
      (t) => t.id === ownerships.find((p) => p.game_id === id)?.transaction_id,
    )?.created_at || "";
  const ownedGames = ownerships
    .map((p) => state.games.find((g) => g.id === p.game_id))
    .filter(Boolean);
  const hiddenGames = ownedGames.filter((g) => preferenceOf(g.id).hidden);
  const games = ownedGames
    .filter(
      (g) =>
        (!collection ||
          memberships.some(
            (m) => m.collection_id === collection.id && m.game_id === g.id,
          )) &&
        (visibility === "all" ||
          preferenceOf(g.id).hidden === (visibility === "hidden")) &&
        g.title.toLowerCase().includes(search.toLowerCase()) &&
        (!reviewed ||
          state.reviews.some(
            (r) => r.game_id === g.id && r.user_id === user.id,
          )),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : dateOf(b.id).localeCompare(dateOf(a.id)),
    );
  const game = games.find((g) => g.id === selection) || games[0];
  const reviews = state.reviews.filter((r) => r.game_id === game?.id);
  const mine = reviews.find((r) => r.user_id === user.id);
  const preference = preferenceOf(game?.id);
  function done(message) {
    setDialog("");
    setNotice(message);
  }
  return (
    <main className="steam-main-content commerce-page steam-library">
      <header className="steam-library-nav">
        <h1>Thư viện</h1>
        <span>TRANG CHỦ</span>
        <span>BỘ SƯU TẬP ({collections.length})</span>
        <Link to="/store">Cửa hàng ↗</Link>
      </header>
      {operation.error && (
        <p role="alert" className="commerce-error">
          {operation.error}
        </p>
      )}
      <div className="library-layout">
        <aside className="library-sidebar">
          <h3>TẤT CẢ TRÒ CHƠI ({ownerships.length})</h3>
          {hiddenGames.length > 0 && (
            <button
              className="commerce-button library-hidden-shortcut"
              aria-pressed={visibility === "hidden"}
              onClick={() => {
                setVisibility("hidden");
                setCollectionId("");
                setSearch("");
                setReviewed(false);
              }}
            >
              Game đã ẩn ({hiddenGames.length})
            </button>
          )}
          <label htmlFor="library-collection">Bộ sưu tập</label>
          <select
            id="library-collection"
            className="commerce-input"
            value={collection?.id || ""}
            onChange={(event) => setCollectionId(event.target.value)}
          >
            <option value="">Tất cả bộ sưu tập</option>
            {collections.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <div className="commerce-actions library-management">
            <button
              className="commerce-button"
              onClick={() => setDialog("create-collection")}
            >
              Tạo bộ sưu tập
            </button>
            {collection && (
              <>
                <button
                  className="commerce-button"
                  onClick={() => setDialog("rename-collection")}
                >
                  Đổi tên
                </button>
                <button
                  className="commerce-button"
                  onClick={() => setDialog("delete-collection")}
                >
                  Xóa bộ sưu tập
                </button>
                <button
                  className="commerce-button"
                  onClick={() => setDialog("add-game")}
                >
                  Thêm game vào bộ sưu tập
                </button>
              </>
            )}
          </div>
          <label htmlFor="library-visibility">Hiển thị game</label>
          <select
            id="library-visibility"
            className="commerce-input"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="visible">Đang hiển thị</option>
            <option value="hidden">Đã ẩn</option>
            <option value="all">Tất cả, kể cả đã ẩn</option>
          </select>
          <input
            aria-label="Tìm trong thư viện"
            className="commerce-input"
            placeholder="Tìm trò chơi…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Sắp xếp thư viện"
            className="commerce-input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Mới mua gần đây</option>
            <option value="name">Tên A–Z</option>
          </select>
          <label className="commerce-checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            Đã đánh giá
          </label>
          {games.map((g) => (
            <button
              className={`library-entry ${g.id === game?.id ? "selected" : ""}`}
              aria-label={g.title}
              key={g.id}
              onClick={() => setSelection(g.id)}
            >
              <Artwork game={g} />
              <span>{g.title}</span>
            </button>
          ))}
        </aside>
        <section className="library-detail">
          {game ? (
            <>
              <div className="steam-library-hero">
                <Artwork game={game} large />
                <div>
                  <small>TRONG THƯ VIỆN CỦA BẠN</small>
                  <h2>{game.title}</h2>
                </div>
              </div>
              <div className="library-detail-content">
                <div className="commerce-actions steam-library-toolbar">
                  <button
                    className="commerce-button primary"
                    onClick={() => {
                      if (
                        !ownerships.some((entry) => entry.game_id === game.id)
                      )
                        return;
                      setDownloadError("");
                      try {
                        downloadGame(game.title);
                      } catch {
                        setDownloadError(
                          "Không thể tải game. Vui lòng thử lại.",
                        );
                      }
                    }}
                  >
                    Tải game
                  </button>
                  <Link
                    className="commerce-button"
                    to={`/games/${encodeURIComponent(game.id)}`}
                  >
                    Xem chi tiết
                  </Link>
                  <button
                    className="commerce-button"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(
                        () =>
                          state.wishlist?.some(
                            (w) =>
                              w.game_id === game.id &&
                              (!w.user_id || w.user_id === user.id),
                          )
                            ? service.removeWishlist(game.id)
                            : service.addWishlist(game.id),
                        () => setNotice("Đã cập nhật danh sách yêu thích."),
                      )
                    }
                  >
                    {state.wishlist?.some(
                      (w) =>
                        w.game_id === game.id &&
                        (!w.user_id || w.user_id === user.id),
                    )
                      ? "♥ Đã yêu thích"
                      : "♡ Thêm vào yêu thích"}
                  </button>
                  <button
                    className="commerce-button"
                    onClick={() => setDialog("note")}
                  >
                    Ghi chú riêng tư
                  </button>
                  <button
                    className="commerce-button"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(
                        () =>
                          service.saveLibraryPreference(
                            game.id,
                            preference.note,
                            !preference.hidden,
                          ),
                        () => {
                          if (preference.hidden) {
                            setVisibility("visible");
                            setSelection(game.id);
                          }
                          setNotice(
                            preference.hidden
                              ? "Đã hiện lại game trong thư viện."
                              : "Đã ẩn game. Chọn “Đã ẩn” để khôi phục; quyền sở hữu vẫn được giữ.",
                          );
                        },
                      )
                    }
                  >
                    {preference.hidden ? "Hiện lại game" : "Ẩn game"}
                  </button>
                  {collection && (
                    <button
                      className="commerce-button"
                      disabled={operation.busy}
                      onClick={() =>
                        operation.run(
                          () =>
                            service.collectionGame(
                              collection.id,
                              game.id,
                              false,
                            ),
                          () =>
                            setNotice(
                              "Đã bỏ game khỏi bộ sưu tập. Game vẫn thuộc thư viện của bạn.",
                            ),
                        )
                      }
                    >
                      Bỏ khỏi bộ sưu tập
                    </button>
                  )}
                </div>
                {preference.note && (
                  <section className="library-private-note">
                    <h3>Ghi chú của bạn</h3>
                    <p>{preference.note}</p>
                  </section>
                )}
                {downloadError && (
                  <p className="commerce-error" role="alert">
                    {downloadError}
                  </p>
                )}
                <p>{game.description}</p>
                <p className="commerce-note">
                  Đã sở hữu từ{" "}
                  {new Date(dateOf(game.id)).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}{" "}
                  · {game.genre}
                </p>
                <div className="commerce-section-title">
                  <h3>Đánh giá của người chơi</h3>
                  <span>
                    {game.rating === null
                      ? "Chưa có đánh giá"
                      : `${game.rating.toFixed(1)} / 5 · ${reviews.length} đánh giá`}
                  </span>
                </div>
                <ReviewList reviews={reviews} users={state.users} />
                <div className="commerce-actions">
                  <button
                    className="commerce-button primary"
                    onClick={() => setDialog("edit")}
                  >
                    {mine ? "Sửa đánh giá" : "Viết đánh giá"}
                  </button>
                  {mine && (
                    <button
                      className="commerce-button"
                      onClick={() => setDialog("delete")}
                    >
                      Xóa đánh giá
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title={
                ownerships.length
                  ? "Không tìm thấy trò chơi phù hợp"
                  : "Thư viện đang trống"
              }
              store
            >
              {collection
                ? "Dùng “Thêm game vào bộ sưu tập” để chọn game đã sở hữu. Kiểm tra bộ lọc nếu game đang bị ẩn."
                : "Bạn có thể thêm game bằng cách mua trong cửa hàng hoặc thay đổi bộ lọc đang chọn."}
            </EmptyState>
          )}
        </section>
      </div>
      {["edit", "delete"].includes(dialog) && game && (
        <ReviewDialog
          game={game}
          review={mine}
          deleting={dialog === "delete"}
          close={() => setDialog("")}
        />
      )}
      {["create-collection", "rename-collection", "delete-collection"].includes(
        dialog,
      ) && (
        <CollectionDialog
          collection={dialog === "create-collection" ? null : collection}
          deleting={dialog === "delete-collection"}
          close={() => setDialog("")}
          done={(row) => {
            if (dialog === "create-collection") setCollectionId(row.id);
            if (dialog === "delete-collection") setCollectionId("");
            done(
              dialog === "delete-collection"
                ? "Đã xóa bộ sưu tập. Các game đã mua vẫn được giữ."
                : "Đã lưu bộ sưu tập.",
            );
          }}
        />
      )}
      {dialog === "add-game" && collection && (
        <AddCollectionGameDialog
          collection={collection}
          games={ownedGames.filter(
            (g) =>
              !memberships.some(
                (m) => m.collection_id === collection.id && m.game_id === g.id,
              ),
          )}
          close={() => setDialog("")}
          done={(id) => {
            setSelection(id);
            setVisibility(preferenceOf(id).hidden ? "all" : "visible");
            setSearch("");
            setReviewed(false);
            done("Đã thêm game vào bộ sưu tập.");
          }}
        />
      )}
      {dialog === "note" && game && (
        <LibraryNoteDialog
          game={game}
          preference={preference}
          close={() => setDialog("")}
          done={() => done("Đã lưu ghi chú riêng tư.")}
        />
      )}
    </main>
  );
}
