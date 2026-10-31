import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import { useOperation } from "../../components/commerce/useOperation";
import {
  Artwork,
  Modal,
  PriceDisplay,
} from "../../components/commerce/CommerceUI";
import { cents, money, priceOf } from "../../services/currency";

export default function CheckoutDialog({ game, close }) {
  const { state, user, service } = useCommerce();
  const [success, setSuccess] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const operation = useOperation();
  const requestKey = useRef(crypto.randomUUID());
  const account = state.users.find((u) => u.id === user.id);
  const owned = state.game_bought.some(
    (p) => p.game_id === game.id && p.user_id === user.id,
  );
  const isWishlisted = (state.wishlist ?? []).some(
    (w) => w.game_id === game.id,
  );
  const price = priceOf(game, state.promotions);
  const insufficient = cents(account?.balance || "0") < cents(price.final);

  async function toggleWishlist() {
    if (wishlistBusy || !service) return;
    setWishlistBusy(true);
    try {
      if (isWishlisted) {
        await service.removeWishlist(game.id);
      } else {
        await service.addWishlist(game.id);
      }
    } finally {
      setWishlistBusy(false);
    }
  }

  return (
    <Modal
      title={success ? "Đã thêm vào thư viện" : game.title}
      close={close}
      {...operation}
    >
      <Artwork game={game} />
      <p>{game.description}</p>
      <p>Giá gốc: {money(price.original)}</p>
      <PriceDisplay game={game} promotions={state.promotions} />
      <p>
        Số dư ví{user.source === "demo" ? " mô phỏng" : ""}:{" "}
        <strong>{money(account?.balance || "0")}</strong>
      </p>
      {owned ? (
        <>
          <p className="positive" role="status">
            Bạn đã sở hữu trò chơi này.
          </p>
          <Link
            className="commerce-button primary"
            to="/library"
            onClick={close}
          >
            Mở thư viện
          </Link>
        </>
      ) : game.status !== "AVAILABLE" ? (
        <p className="commerce-error">Trò chơi hiện chưa mở bán.</p>
      ) : insufficient ? (
        <>
          <p className="commerce-error">Số dư không đủ để mua trò chơi.</p>
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <Link
              className="commerce-button primary"
              to="/wallet"
              onClick={close}
            >
              {user.source === "demo" ? "Nạp tiền Demo" : "Mở ví"}
            </Link>
            <button
              type="button"
              className="commerce-button"
              disabled={wishlistBusy}
              onClick={toggleWishlist}
            >
              {isWishlisted ? "♥ Bỏ yêu thích" : "♡ Thêm vào yêu thích"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="commerce-note">
            {user.source === "demo"
              ? "DEMO · Không phát sinh thanh toán thật."
              : "Trừ số dư trong ví của bạn."}{" "}
            Một game mỗi giao dịch.
          </p>
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button
              className="commerce-button primary"
              disabled={operation.busy}
              onClick={() =>
                operation.run(
                  () =>
                    service.purchase(game.id, requestKey.current, price.final),
                  () => setSuccess(true),
                )
              }
            >
              {operation.busy
                ? "Đang xử lý…"
                : cents(price.final) === 0n
                  ? "Thêm miễn phí vào thư viện"
                  : "Xác nhận mua game"}
            </button>
            <button
              type="button"
              className="commerce-button"
              disabled={wishlistBusy || operation.busy}
              onClick={toggleWishlist}
            >
              {isWishlisted ? "♥ Bỏ yêu thích" : "♡ Thêm vào yêu thích"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
