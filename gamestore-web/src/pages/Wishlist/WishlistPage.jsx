import { useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import {
  Artwork,
  EmptyState,
  PageHeader,
  PriceDisplay,
} from "../../components/commerce/CommerceUI";
import { cents, priceOf } from "../../services/currency";
import CheckoutDialog from "../Checkout/CheckoutDialog";
import "./WishlistPage.css";

const SORTS = {
  sale: "Đang giảm giá trước",
  recent: "Mới thêm gần đây",
  name: "Tên A–Z",
  price: "Giá thấp đến cao",
};

export default function WishlistPage() {
  const { state, user, service } = useCommerce();
  const [sort, setSort] = useState("sale");
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  if (user.source !== "jwt")
    return (
      <main className="steam-main-content commerce-page">
        <PageHeader eyebrow="DANH SÁCH MUỐN MUA" title="Yêu thích" />
        <section className="commerce-panel">
          <p role="status">
            Danh sách yêu thích cần tài khoản thật. Chế độ Demo chưa hỗ trợ.
          </p>
        </section>
      </main>
    );

  const owned = new Set(
    state.game_bought
      .filter((p) => p.user_id === user.id)
      .map((p) => p.game_id),
  );
  const rows = (state.wishlist ?? [])
    .map((entry) => {
      const game = state.games.find((g) => g.id === entry.game_id);
      if (!game || game.status !== "AVAILABLE" || owned.has(game.id))
        return null;
      const price = priceOf(game, state.promotions);
      return {
        game,
        price,
        added: entry.created_at,
        onSale: price.discount !== "0",
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (sort === "name")
        return a.game.title.localeCompare(b.game.title, "vi");
      if (sort === "price")
        return Number(cents(a.price.final) - cents(b.price.final));
      if (sort === "sale" && a.onSale !== b.onSale) return a.onSale ? -1 : 1;
      return b.added.localeCompare(a.added);
    });
  const saleCount = rows.filter((row) => row.onSale).length;

  async function remove(game) {
    if (busyId) return;
    setBusyId(game.id);
    setError("");
    try {
      await service.removeWishlist(game.id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="steam-main-content commerce-page">
      <PageHeader eyebrow="DANH SÁCH MUỐN MUA" title="Yêu thích">
        {rows.length
          ? `${rows.length} trò chơi${saleCount ? ` · ${saleCount} đang giảm giá` : ""}. Bạn sẽ nhận thông báo khi game ở đây được giảm giá.`
          : "Lưu những game bạn quan tâm và nhận thông báo khi chúng giảm giá."}
      </PageHeader>
      {error && (
        <p className="commerce-error" role="alert">
          {error}
        </p>
      )}
      {rows.length > 0 && (
        <div className="wishlist-toolbar">
          <label>
            Sắp xếp
            <select
              className="commerce-input"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title="Danh sách yêu thích đang trống" store>
          Bấm biểu tượng ♡ trên game trong cửa hàng để lưu vào đây.
        </EmptyState>
      ) : (
        <div className="wishlist-grid">
          {rows.map(({ game, onSale, added }) => (
            <article className="wishlist-card" key={game.id}>
              <Artwork game={game} />
              <div className="wishlist-card-body">
                <h3>
                  {game.title}
                  {onSale && (
                    <span className="wishlist-sale">Đang giảm giá</span>
                  )}
                </h3>
                <small>
                  {game.genre} · Thêm ngày{" "}
                  {new Date(added).toLocaleDateString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </small>
                <PriceDisplay game={game} promotions={state.promotions} />
                <div className="commerce-actions">
                  <button
                    className="commerce-button primary"
                    onClick={() => setSelected(game)}
                  >
                    {onSale ? "Mua ngay" : "Xem chi tiết"}
                  </button>
                  <button
                    className="commerce-button"
                    disabled={busyId === game.id}
                    onClick={() => remove(game)}
                  >
                    {busyId === game.id ? "Đang bỏ…" : "Bỏ yêu thích"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {selected && (
        <CheckoutDialog
          game={state.games.find((g) => g.id === selected.id) || selected}
          close={() => setSelected(null)}
        />
      )}
    </main>
  );
}
