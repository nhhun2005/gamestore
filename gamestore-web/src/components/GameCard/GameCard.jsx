import "./GameCard.css";
import { Artwork, PriceDisplay } from "../commerce/CommerceUI";

function GameCard({
  title,
  subtitle,
  actionText,
  isOwned,
  onActionClick,
  game,
  promotions = [],
}) {
  return (
    <article className="game-card">
      {game ? (
        <Artwork game={game} />
      ) : (
        <div className="game-card-thumb">{title}</div>
      )}
      <div className="game-card-body">
        <h3 className="game-card-title">{title}</h3>
        <div className="game-card-meta">
          <span>
            {game
              ? `${game.genre} · ${game.rating === null ? "Chưa có đánh giá" : `${game.rating.toFixed(1)} / 5`}`
              : subtitle}
          </span>
          {game && <PriceDisplay game={game} promotions={promotions} />}
          {isOwned || onActionClick ? (
            <button className="steam-auth-btn primary" onClick={onActionClick}>
              {game ? "Xem chi tiết" : actionText || "Xem chi tiết"}
            </button>
          ) : (
            <span className="game-price">{actionText}</span>
          )}
        </div>
      </div>
    </article>
  );
}

export default GameCard;
