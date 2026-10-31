import { useState } from "react";
import "./GameCard.css";
import { Artwork, PriceDisplay } from "../commerce/CommerceUI";
import { useCommerce } from "../commerce/context";

function GameCard({
  title,
  subtitle,
  actionText,
  isOwned,
  onActionClick,
  game,
  promotions = [],
}) {
  const { state, user, service } = useCommerce() || {};
  const [busy, setBusy] = useState(false);

  const owned =
    isOwned ||
    (game &&
      state?.game_bought?.some(
        (p) => p.game_id === game.id && p.user_id === user?.id,
      ));
  const isWishlisted =
    game && (state?.wishlist ?? []).some((w) => w.game_id === game.id);

  async function handleWishlistToggle(e) {
    e.stopPropagation();
    if (!service || !game || busy) return;
    setBusy(true);
    try {
      if (isWishlisted) {
        await service.removeWishlist(game.id);
      } else {
        await service.addWishlist(game.id);
      }
    } catch {
      // Ignored for smoother UI toggle
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="game-card">
      {game && user && !owned && (
        <button
          type="button"
          className={`game-card-wishlist-btn ${isWishlisted ? "active" : ""}`}
          aria-label={isWishlisted ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
          title={isWishlisted ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
          disabled={busy}
          onClick={handleWishlistToggle}
        >
          {isWishlisted ? "♥" : "♡"}
        </button>
      )}
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
