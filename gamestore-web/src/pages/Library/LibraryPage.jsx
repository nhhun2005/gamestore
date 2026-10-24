import GameCard from "../../components/GameCard/GameCard";

function LibraryPage({ user, onNavigate }) {
  return (
    <main className="steam-main-content">
      <div className="section-banner">
        <h2>Thư viện trò chơi của tôi</h2>
        <p>Danh sách các tựa game bạn đã sở hữu (game_bought).</p>
      </div>

      {!user ? (
        <p>
          Vui lòng{" "}
          <span className="steam-link" onClick={() => onNavigate("login")}>
            đăng nhập
          </span>{" "}
          để xem thư viện trò chơi của bạn.
        </p>
      ) : (
        <div className="games-grid">
          <GameCard
            title="Pixel Valley Farming"
            subtitle="Đã sở hữu"
            actionText="Chơi ngay"
            isOwned={true}
          />
        </div>
      )}
    </main>
  );
}

export default LibraryPage;
