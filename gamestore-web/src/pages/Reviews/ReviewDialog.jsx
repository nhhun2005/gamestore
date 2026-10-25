import { useState } from "react";
import { Modal } from "../../components/commerce/CommerceUI";
import { useCommerce } from "../../components/commerce/context";
import { useOperation } from "../../components/commerce/useOperation";
export default function ReviewDialog({
  game,
  review,
  close,
  deleting = false,
}) {
  const { service, notify } = useCommerce();
  const [rating, setRating] = useState(review?.rating || 5);
  const [content, setContent] = useState(review?.content || "");
  const operation = useOperation();
  const done = () => {
    notify(deleting ? "Đã xóa đánh giá." : "Đã lưu đánh giá.");
    close();
  };
  return (
    <Modal
      title={deleting ? "Xóa đánh giá?" : `Đánh giá ${game.title}`}
      close={close}
      {...operation}
    >
      {deleting ? (
        <>
          <p>Đánh giá của bạn sẽ bị xóa. Bạn có thể viết lại sau.</p>
          <button
            className="commerce-button danger"
            disabled={operation.busy}
            onClick={() =>
              operation.run(() => service.deleteReview(review.id), done)
            }
          >
            Xác nhận xóa
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            operation.run(
              () => service.saveReview(game.id, Number(rating), content),
              done,
            );
          }}
        >
          <label htmlFor="review-rating">Điểm đánh giá</label>
          <select
            id="review-rating"
            className="commerce-input"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          >
            {Array.from({ length: 9 }, (_, i) => 1 + i / 2).map((value) => (
              <option key={value} value={value}>
                {value} / 5
              </option>
            ))}
          </select>
          <label htmlFor="review-content">Chia sẻ trải nghiệm</label>
          <textarea
            id="review-content"
            className="commerce-input"
            rows={5}
            maxLength={2000}
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <small>{content.length} / 2.000 ký tự</small>
          <button
            className="commerce-button primary"
            disabled={operation.busy || !content.trim()}
          >
            {operation.busy ? "Đang lưu…" : "Lưu đánh giá"}
          </button>
        </form>
      )}
    </Modal>
  );
}
