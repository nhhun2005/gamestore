import "./GameCard.css";

function GameCard({ title, subtitle, actionText, isOwned, onActionClick }) {
  return (
    <div className="game-card">
      <div className="game-card-thumb">{title}</div>
      <div className="game-card-body">
        <div className="game-card-title">{title}</div>
        <div className="game-card-meta">
          <span>{subtitle}</span>
          {isOwned ? (
            <button className="steam-auth-btn primary" onClick={onActionClick}>
              {actionText || "Chơi ngay"}
            </button>
          ) : (
            <span className="game-price">{actionText}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default GameCard;
