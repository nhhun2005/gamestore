import GameCard from "../../components/GameCard/GameCard";
import { useState } from "react";
import CheckoutDialog from "../Checkout/CheckoutDialog";
import { Artwork } from "../../components/commerce/CommerceUI";

const FEATURED_GAMES = [
  {
    id: 1,
    title: "Cyberpunk Odyssey 2077",
    price: "490.000₫",
    rating: "4.5 ⭐",
  },
  { id: 2, title: "Elden Chronicles", price: "850.000₫", rating: "5.0 ⭐" },
  { id: 3, title: "Pixel Valley Farming", price: "165.000₫", rating: "4.5 ⭐" },
  {
    id: 4,
    title: "Black Myth: Legends",
    price: "1.299.000₫",
    rating: "5.0 ⭐",
  },
];

function StorePage({ user, games = FEATURED_GAMES, promotions = [] }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  return (
    <main className="steam-main-content">
      <div className="section-banner">
        <h2>Nổi bật & Đề xuất</h2>
        <p>
          Khám phá các tựa game hấp dẫn trên hệ thống.{" "}
          {user
            ? `Xin chào ${user.username}, bạn đang truy cập với quyền ${user.role}.`
            : "Hãy đăng nhập để mua game và lưu vào thư viện của bạn."}
        </p>
      </div>

      {games[0]?.cover_image_url && (
        <section className="store-feature">
          <div>
            <small>KHÁM PHÁ THẾ GIỚI TIẾP THEO</small>
            <h1>
              Một trò chơi.
              <br />
              Vô vàn câu chuyện.
            </h1>
            <p>Những cuộc phiêu lưu đáng nhớ đang chờ bạn.</p>
            <a className="commerce-button primary" href="#store-catalog">
              Khám phá trò chơi ↓
            </a>
          </div>
          <Artwork game={games[0]} large />
        </section>
      )}
      <div className="commerce-section-title" id="store-catalog">
        <h2>Dành cho bạn</h2>
        <input
          className="commerce-input"
          aria-label="Tìm trong cửa hàng"
          placeholder="Tìm trò chơi…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="games-grid">
        {games
          .filter((game) =>
            game.title.toLowerCase().includes(search.toLowerCase()),
          )
          .map((game) => (
            <GameCard
              key={game.id}
              title={game.title}
              subtitle={`Đánh giá: ${game.rating}`}
              actionText={game.price}
              isOwned={false}
              game={game.cover_image_url !== undefined ? game : undefined}
              promotions={promotions}
              onActionClick={
                game.cover_image_url !== undefined
                  ? () => setSelected(game)
                  : undefined
              }
            />
          ))}
      </div>
      {!games.some((game) =>
        game.title.toLowerCase().includes(search.toLowerCase()),
      ) && <p className="commerce-empty">Không tìm thấy trò chơi.</p>}
      {selected && (
        <CheckoutDialog
          game={games.find((game) => game.id === selected.id) || selected}
          close={() => setSelected(null)}
        />
      )}
    </main>
  );
}

export default StorePage;
