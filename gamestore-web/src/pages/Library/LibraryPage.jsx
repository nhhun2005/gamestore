import { useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import {
  Artwork,
  EmptyState,
  PageHeader,
} from "../../components/commerce/CommerceUI";
import ReviewDialog from "../Reviews/ReviewDialog";
export default function LibraryPage({ user }) {
  const { state } = useCommerce();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [reviewed, setReviewed] = useState(false);
  const [selection, setSelection] = useState("");
  const [dialog, setDialog] = useState("");
  const ownerships = state.game_bought.filter((p) => p.user_id === user.id);
  const dateOf = (id) =>
    state.transactions.find(
      (t) => t.id === ownerships.find((p) => p.game_id === id)?.transaction_id,
    )?.created_at || "";
  const games = ownerships
    .map((p) => state.games.find((g) => g.id === p.game_id))
    .filter(
      (g) =>
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
  return (
    <main className="steam-main-content commerce-page">
      <PageHeader eyebrow="BỘ SƯU TẬP CỦA BẠN" title="Thư viện">
        Những thế giới đã thuộc về bạn.
      </PageHeader>
      <div className="library-layout">
        <aside className="commerce-panel library-sidebar">
          <h3>TẤT CẢ TRÒ CHƠI ({ownerships.length})</h3>
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
              key={g.id}
              onClick={() => setSelection(g.id)}
            >
              {g.title}
            </button>
          ))}
        </aside>
        <section className="commerce-panel library-detail">
          {game ? (
            <>
              <Artwork game={game} large />
              <div className="library-detail-content">
                <h2>{game.title}</h2>
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
                {reviews.map((r) => (
                  <article className="player-review" key={r.id}>
                    <strong>
                      {state.users.find((u) => u.id === r.user_id)?.username ||
                        "Người chơi"}{" "}
                      · {r.rating} / 5
                    </strong>
                    <p>{r.content}</p>
                  </article>
                ))}
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
              Bạn có thể thêm game bằng cách mua trong cửa hàng.
            </EmptyState>
          )}
        </section>
      </div>
      {dialog && game && (
        <ReviewDialog
          game={game}
          review={mine}
          deleting={dialog === "delete"}
          close={() => setDialog("")}
        />
      )}
    </main>
  );
}
