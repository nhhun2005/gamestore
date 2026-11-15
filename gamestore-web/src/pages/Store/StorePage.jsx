import GameCard from "../../components/GameCard/GameCard";
import { useEffect, useState } from "react";
import { Artwork } from "../../components/commerce/CommerceUI";
import { storeApi } from "../../services/storeApi.js";

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState({ loading: true, data: null, error: "", key: "" });
  const real = user?.source !== "demo";
  const requestKey = `${search}:${page}:${retry}`;
  useEffect(() => {
    if (!real) return;
    let active = true;
    const controller = new AbortController();
    const key = `${search}:${page}:${retry}`;
    const timer = setTimeout(() => {
      storeApi.search({ q: search, page, size: 20, signal: controller.signal }).then(
        (data) => { if (active) setRemote({ loading: false, data, error: "", key }); },
        (error) => { if (active && error.name !== "AbortError") setRemote({ loading: false, data: null, error: error.message, key }); },
      );
    }, 300);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [real, user?.id, search, page, retry]);
  const loading = real && (remote.loading || remote.key !== requestKey);
  const error = real && !loading ? remote.error : "";
  const visibleGames = real ? (loading || error ? [] : remote.data?.items || []) : games.filter((game) => game.title.toLowerCase().includes(search.toLowerCase()));
  const visiblePromotions = real ? remote.data?.promotions || [] : promotions;
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

      {visibleGames[0]?.cover_image_url && (
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
          <Artwork game={visibleGames[0]} large />
        </section>
      )}
      <div className="commerce-section-title" id="store-catalog">
        <h2>Dành cho bạn</h2>
        <input
          className="commerce-input"
          aria-label="Tìm trong cửa hàng"
          placeholder="Tìm trò chơi…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          maxLength={200}
        />
      </div>

      <div className="games-grid">
        {visibleGames
          .map((game) => (
            <GameCard
              key={game.id}
              title={game.title}
              subtitle={`Đánh giá: ${game.rating}`}
              actionText={game.price}
              isOwned={false}
              game={game.cover_image_url !== undefined ? game : undefined}
              promotions={visiblePromotions}
            />
          ))}
      </div>
      {loading && <p role="status">Đang tải trò chơi…</p>}
      {error && <div><p role="alert" className="commerce-error">{error}</p><button className="commerce-button" onClick={() => setRetry((value) => value + 1)}>Thử lại</button></div>}
      {!loading && !error && visibleGames.length === 0 && <p className="commerce-empty">Không tìm thấy trò chơi.</p>}
      {real && !loading && !error && (remote.data?.total > 20 || page > 0) && <nav aria-label="Phân trang cửa hàng" className="commerce-section-title">
        <button className="commerce-button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Trang trước</button>
        <span>Trang {page + 1} / {Math.max(page + 1, Math.ceil(remote.data.total / 20))}</span>
        <button className="commerce-button" disabled={(page + 1) * 20 >= remote.data.total} onClick={() => setPage((value) => value + 1)}>Trang sau</button>
      </nav>}
    </main>
  );
}

export default StorePage;
