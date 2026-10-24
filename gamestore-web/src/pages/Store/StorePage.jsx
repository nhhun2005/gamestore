import GameCard from "../../components/GameCard/GameCard";

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

function StorePage({ user }) {
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

      <div className="games-grid">
        {FEATURED_GAMES.map((game) => (
          <GameCard
            key={game.id}
            title={game.title}
            subtitle={`Đánh giá: ${game.rating}`}
            actionText={game.price}
            isOwned={false}
          />
        ))}
      </div>
    </main>
  );
}

export default StorePage;
