import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCommerce } from "../../components/commerce/context";
import { PriceDisplay } from "../../components/commerce/CommerceUI";
import { cents, priceOf } from "../../services/currency";
import { downloadGame } from "../../services/gameDownload.js";
import CheckoutDialog from "../Checkout/CheckoutDialog";
import ReviewDialog from "../Reviews/ReviewDialog";
import "./GameDetailsPage.css";

function GameDetailsInner({ gameId }) {
  const { state, user, service } = useCommerce();
  const game = (state?.games ?? []).find((g) => g.id === gameId);

  const [showCheckout, setShowCheckout] = useState(false);
  const [reviewDialogMode, setReviewDialogMode] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistError, setWishlistError] = useState("");
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [capsuleImgFailed, setCapsuleImgFailed] = useState(false);

  const wishlistMutationRef = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [gameId]);

  useEffect(() => {
    const prevTitle = document.title;
    if (game?.title) {
      document.title = `${game.title} trên GameStore`;
    } else {
      document.title = "Không tìm thấy trò chơi";
    }
    return () => {
      document.title = prevTitle;
    };
  }, [game?.title]);

  if (!game) {
    return (
      <main className="game-details-page">
        <div className="game-details-container game-details-not-found">
          <nav className="game-details-breadcrumb" aria-label="Điều hướng">
            <Link to="/store" className="game-details-breadcrumb-link">
              Về cửa hàng
            </Link>
          </nav>
          <h1 className="game-details-title">Không tìm thấy trò chơi</h1>
          <p className="game-details-not-found-desc">
            Trò chơi bạn tìm kiếm không tồn tại hoặc đã ngừng cung cấp.
          </p>
          <Link to="/store" className="game-details-btn-primary">
            Về cửa hàng
          </Link>
        </div>
      </main>
    );
  }

  const isOwned = Boolean(
    user?.id &&
      (state?.game_bought ?? []).some(
        (p) => p.game_id === game.id && p.user_id === user.id,
      ),
  );

  const isWishlisted = Boolean(
    (state?.wishlist ?? []).some(
      (w) => w.game_id === game.id && (!w.user_id || w.user_id === user?.id),
    ),
  );

  const developer = (state?.users ?? []).find(
    (u) => u.id === game.developer_id,
  );
  const developerName = developer?.username || "Không xác định";

  const reviews = (state?.reviews ?? []).filter((r) => r.game_id === game.id);
  const userReview = user?.id
    ? reviews.find((r) => r.user_id === user.id)
    : null;

  const price = priceOf(game, state?.promotions ?? []);
  const isFree = cents(price.final) === 0n;

  const handleDownload = async () => {
    setDownloadError("");
    if (!isOwned) {
      setDownloadError("Bạn chưa sở hữu trò chơi này.");
      return;
    }
    try {
      await downloadGame(game.title);
    } catch (err) {
      setDownloadError(err?.message || "Không thể tải trò chơi.");
    }
  };

  const handleToggleWishlist = async () => {
    if (wishlistMutationRef.current || wishlistBusy || !service) return;
    wishlistMutationRef.current = true;
    setWishlistBusy(true);
    setWishlistError("");
    try {
      if (isWishlisted) {
        await service.removeWishlist(game.id);
      } else {
        await service.addWishlist(game.id);
      }
    } catch (err) {
      setWishlistError(
        err?.message || "Không thể cập nhật danh sách yêu thích.",
      );
    } finally {
      wishlistMutationRef.current = false;
      setWishlistBusy(false);
    }
  };

  return (
    <main className="game-details-page">
      <div className="game-details-store-nav">
        <div className="game-details-store-nav-inner">
          <Link to="/store" className="game-details-store-nav-item">
            Cửa hàng
          </Link>
          <Link to="/wishlist" className="game-details-store-nav-item">
            Danh sách yêu thích
          </Link>
          <Link to="/library" className="game-details-store-nav-item">
            Thư viện
          </Link>
        </div>
      </div>

      <div className="game-details-container">
        <nav className="game-details-breadcrumb" aria-label="Điều hướng">
          <Link to="/store" className="game-details-breadcrumb-link">
            Về cửa hàng
          </Link>
          {game.genre && (
            <>
              <span className="game-details-breadcrumb-sep">&gt;</span>
              <span className="game-details-breadcrumb-text">{game.genre}</span>
            </>
          )}
          <span className="game-details-breadcrumb-sep">&gt;</span>
          <span className="game-details-breadcrumb-current">{game.title}</span>
        </nav>

        <h1 className="game-details-title">{game.title}</h1>

        <section className="game-details-hero">
          <div className="game-details-hero-left">
            {game.cover_image_url && !heroImgFailed ? (
              <div className="game-details-hero-art">
                <img
                  src={game.cover_image_url}
                  alt={game.title}
                  className="game-details-hero-img"
                  onError={() => setHeroImgFailed(true)}
                />
              </div>
            ) : (
              <div className="game-details-hero-art game-details-hero-art-empty">
                <div className="game-details-empty-placeholder">
                  <div className="game-details-empty-icon" aria-hidden="true">
                    🎮
                  </div>
                  <div className="game-details-empty-title">{game.title}</div>
                  <div className="game-details-empty-sub">
                    Chưa có hình ảnh giới thiệu
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="game-details-hero-right">
            <div className="game-details-summary">
              {game.cover_image_url && !capsuleImgFailed ? (
                <div className="game-details-capsule">
                  <img
                    src={game.cover_image_url}
                    alt={game.title}
                    className="game-details-capsule-img"
                    onError={() => setCapsuleImgFailed(true)}
                  />
                </div>
              ) : (
                <div className="game-details-capsule game-details-capsule-empty">
                  <span>{game.title}</span>
                </div>
              )}

              <p className="game-details-summary-desc">{game.description}</p>

              <div className="game-details-summary-meta">
                <div className="game-details-meta-row">
                  <span className="game-details-meta-label">Đánh giá:</span>
                  <span className="game-details-meta-value">
                    {game.rating !== null && game.rating !== undefined
                      ? `${Number(game.rating).toFixed(1)} / 5`
                      : "Chưa có đánh giá"}
                    <span className="game-details-meta-sub">
                      {" "}
                      ({reviews.length} đánh giá)
                    </span>
                  </span>
                </div>

                <div className="game-details-meta-row">
                  <span className="game-details-meta-label">
                    Nhà phát triển:
                  </span>
                  <span className="game-details-meta-value">
                    {developerName}
                  </span>
                </div>

                {game.genre && (
                  <div className="game-details-meta-row">
                    <span className="game-details-meta-label">Thể loại:</span>
                    <div className="game-details-tags">
                      <span className="game-details-tag">{game.genre}</span>
                    </div>
                  </div>
                )}
              </div>

              {!isOwned && game.status === "AVAILABLE" && (
                <div className="game-details-hero-wishlist">
                  <button
                    type="button"
                    className={`game-details-btn-wishlist ${isWishlisted ? "active" : ""}`}
                    disabled={wishlistBusy}
                    onClick={handleToggleWishlist}
                  >
                    {wishlistBusy
                      ? "Đang xử lý…"
                      : isWishlisted
                        ? "♥ Bỏ yêu thích"
                        : "♡ Thêm vào yêu thích"}
                  </button>
                  {wishlistError && (
                    <p className="game-details-error" role="alert">
                      {wishlistError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="game-details-lower-layout">
          <div className="game-details-main-col">
            {isOwned ? (
              <div className="game-details-purchase-panel game-details-purchase-owned">
                <div className="game-details-purchase-header">
                  <h3 className="game-details-purchase-title">
                    Bạn đã sở hữu trò chơi này.
                  </h3>
                  <p className="game-details-purchase-subtitle">
                    {game.title} đã có trong bộ sưu tập của bạn.
                  </p>
                </div>
                <div className="game-details-purchase-actions">
                  <button
                    type="button"
                    className="game-details-btn-download"
                    onClick={handleDownload}
                  >
                    <span aria-hidden="true" className="game-details-btn-icon">
                      ⬇
                    </span>
                    Tải game
                  </button>
                  <Link to="/library" className="game-details-link-library">
                    Mở thư viện
                  </Link>
                </div>
                {downloadError && (
                  <p className="game-details-error" role="alert">
                    {downloadError}
                  </p>
                )}
              </div>
            ) : game.status === "AVAILABLE" ? (
              <div className="game-details-purchase-panel">
                <div className="game-details-purchase-header">
                  <h3 className="game-details-purchase-title">
                    Mua {game.title}
                  </h3>
                </div>
                <div className="game-details-purchase-actions">
                  <div className="game-details-price-container">
                    <PriceDisplay
                      game={game}
                      promotions={state?.promotions ?? []}
                    />
                  </div>
                  <button
                    type="button"
                    className="game-details-btn-purchase"
                    onClick={() => setShowCheckout(true)}
                  >
                    {isFree ? "Thêm miễn phí vào thư viện" : "Mua game"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="game-details-purchase-panel game-details-purchase-unavailable">
                <div className="game-details-purchase-header">
                  <h3 className="game-details-purchase-title">{game.title}</h3>
                  <p className="game-details-purchase-subtitle">
                    Trò chơi hiện chưa mở bán.
                  </p>
                </div>
              </div>
            )}

            <section className="game-details-section game-details-about">
              <div className="game-details-section-divider">
                <h2 className="game-details-section-heading">Về trò chơi này</h2>
              </div>
              <div className="game-details-about-content">
                <p className="game-details-description">{game.description}</p>
                {game.version && (
                  <p className="game-details-meta-line">
                    <strong>Phiên bản:</strong> {game.version}
                  </p>
                )}
                {game.uploaded_at && (
                  <p className="game-details-meta-line">
                    <strong>Ngày đăng tải:</strong>{" "}
                    {new Date(game.uploaded_at).toLocaleDateString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                )}
              </div>
            </section>

            <section className="game-details-section game-details-reviews">
              <div className="game-details-section-divider">
                <h2 className="game-details-section-heading">
                  Đánh giá của người chơi
                </h2>
              </div>
              <div className="game-details-reviews-toolbar">
                <div className="game-details-reviews-stat">
                  <span className="game-details-reviews-score">
                    {game.rating !== null && game.rating !== undefined
                      ? `Điểm trung bình: ${Number(game.rating).toFixed(1)} / 5`
                      : "Chưa có đánh giá"}
                  </span>
                  <span className="game-details-bullet">·</span>
                  <span className="game-details-reviews-count">
                    {reviews.length} đánh giá
                  </span>
                </div>
                {isOwned && (
                  <div className="game-details-reviews-controls">
                    <button
                      type="button"
                      className="game-details-btn-review"
                      onClick={() =>
                        setReviewDialogMode(userReview ? "edit" : "create")
                      }
                    >
                      {userReview ? "Sửa đánh giá" : "Viết đánh giá"}
                    </button>
                    {userReview && (
                      <button
                        type="button"
                        className="game-details-btn-review danger"
                        onClick={() => setReviewDialogMode("delete")}
                      >
                        Xóa đánh giá
                      </button>
                    )}
                  </div>
                )}
              </div>

              {reviews.length > 0 ? (
                <div className="game-details-review-list">
                  {reviews.map((r) => {
                    const author = (state?.users ?? []).find(
                      (u) => u.id === r.user_id,
                    );
                    const authorName = author?.username || "Người chơi";
                    return (
                      <article key={r.id} className="game-details-review-card">
                        <div className="game-details-review-header">
                          <div
                            className="game-details-review-avatar"
                            aria-hidden="true"
                          >
                            {authorName.charAt(0).toUpperCase()}
                          </div>
                          <div className="game-details-review-info">
                            <span className="game-details-review-author">
                              {authorName}
                            </span>
                            <span className="game-details-review-rating">
                              ★ {r.rating} / 5
                            </span>
                          </div>
                        </div>
                        <p className="game-details-review-body">{r.content}</p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="game-details-empty-reviews">
                  <p>Chưa có đánh giá nào cho trò chơi này.</p>
                  {isOwned ? (
                    <p className="game-details-empty-prompt">
                      Viết đánh giá để chia sẻ trải nghiệm của bạn với cộng đồng.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          <aside className="game-details-side-col">
            {isOwned && (
              <div className="game-details-side-panel game-details-side-owned">
                <div
                  className="game-details-side-owned-icon"
                  aria-hidden="true"
                >
                  ✓
                </div>
                <div className="game-details-side-owned-text">
                  <strong>Đã có trong thư viện</strong>
                  <p>Trò chơi nằm trong bộ sưu tập của bạn.</p>
                  <Link to="/library" className="game-details-side-link">
                    Xem trong thư viện →
                  </Link>
                </div>
              </div>
            )}

            <div className="game-details-side-panel">
              <h3 className="game-details-side-heading">Thông tin trò chơi</h3>
              <dl className="game-details-side-list">
                <div className="game-details-side-item">
                  <dt>Thể loại:</dt>
                  <dd>{game.genre || "—"}</dd>
                </div>
                <div className="game-details-side-item">
                  <dt>Nhà phát triển:</dt>
                  <dd>{developerName}</dd>
                </div>
                <div className="game-details-side-item">
                  <dt>Trạng thái:</dt>
                  <dd>
                    {game.status === "AVAILABLE"
                      ? "Đang mở bán"
                      : "Chưa mở bán"}
                  </dd>
                </div>
                {game.version && (
                  <div className="game-details-side-item">
                    <dt>Phiên bản:</dt>
                    <dd>{game.version}</dd>
                  </div>
                )}
                {game.uploaded_at && (
                  <div className="game-details-side-item">
                    <dt>Ngày đăng:</dt>
                    <dd>
                      {new Date(game.uploaded_at).toLocaleDateString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </aside>
        </div>
      </div>

      {showCheckout && (
        <CheckoutDialog game={game} close={() => setShowCheckout(false)} />
      )}

      {reviewDialogMode && (
        <ReviewDialog
          game={game}
          review={userReview}
          deleting={reviewDialogMode === "delete"}
          close={() => setReviewDialogMode("")}
        />
      )}
    </main>
  );
}

export default function GameDetailsPage() {
  const { gameId, id } = useParams();
  const currentId = gameId || id;
  return <GameDetailsInner key={currentId || "none"} gameId={currentId} />;
}
