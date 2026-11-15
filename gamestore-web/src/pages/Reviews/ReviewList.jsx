import "./Reviews.css";

export default function ReviewList({ reviews, users = [] }) {
  if (!reviews.length)
    return (
      <p className="steam-review-empty">
        Chưa có đánh giá nào. Chia sẻ trải nghiệm của bạn với cộng đồng.
      </p>
    );
  return (
    <div className="steam-reviews">
      {reviews.map((review) => {
        const name =
          review.username ||
          users.find((u) => u.id === review.user_id)?.username ||
          "Người chơi";
        return (
          <article className="steam-review" key={review.id}>
            <aside className="steam-review-author">
              <span className="steam-review-avatar" aria-hidden="true">
                {name.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{name}</strong>
                <small>Đã sở hữu trò chơi</small>
              </div>
            </aside>
            <div className="steam-review-main">
              <header>
                <span className="steam-review-star" aria-hidden="true">
                  ★
                </span>
                <div>
                  <strong>{review.rating} / 5</strong>
                  <small>Đánh giá của người chơi</small>
                </div>
              </header>
              <p>{review.content}</p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
