import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistError, setWishlistError] = useState("");
  const operation = useOperation();
  const [pendingMethod, setPendingMethod] = useState(null);
  const requestKeys = useRef({
    wallet: crypto.randomUUID(),
    gateway: crypto.randomUUID(),
  });
  const gatewayBusy = operation.busy && pendingMethod === "gateway";
  const walletBusy = operation.busy && pendingMethod === "wallet";
  const account = state.users.find((u) => u.id === user.id);
  const owned = state.game_bought.some(
    (p) => p.game_id === game.id && p.user_id === user.id,
  );
  const isWishlisted = (state.wishlist ?? []).some(
    (w) => w.game_id === game.id,
  );
  const price = priceOf(game, state.promotions);
  const insufficient = cents(account?.balance || "0") < cents(price.final);
  const sandboxAvailable =
    user.source === "jwt" &&
    state.capabilities?.sandbox_payments &&
    cents(price.final) > 0n;

  function pay(method) {
    operation.run(
      async () => {
        setPendingMethod(method);
        try {
          return method === "gateway"
            ? await service.createCheckout(
                game.id,
                requestKeys.current.gateway,
                price.final,
              )
            : await service.purchase(
                game.id,
                requestKeys.current.wallet,
                price.final,
              );
        } finally {
          setPendingMethod(null);
        }
      },
      (payment) => {
        if (method === "gateway") {
          close();
          navigate(`/checkout/${encodeURIComponent(payment.id)}`);
        } else setSuccess(true);
      },
    );
  }

  async function toggleWishlist() {
    if (wishlistBusy || !service) return;
    setWishlistBusy(true);
    setWishlistError("");
    try {
      if (isWishlisted) {
        await service.removeWishlist(game.id);
      } else {
        await service.addWishlist(game.id);
      }
    } catch (error) {
      setWishlistError(error.message || "Chưa cập nhật được yêu thích.");
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
      {wishlistError && (
        <p role="alert" className="commerce-error">
          {wishlistError}
        </p>
      )}
      <p>
        Số dư ví: <strong>{money(account?.balance || "0")}</strong>
      </p>
      {!owned && game.status === "AVAILABLE" && sandboxAvailable && (
        <section
          className="checkout-payment-option checkout-gateway-option"
          aria-label="GameStore Pay"
        >
          <div>
            <strong>GameStore Pay</strong>
            <small>Thẻ ngân hàng hoặc QR · Sandbox · Không trừ số dư ví</small>
          </div>
          <button
            className="commerce-button primary checkout-gateway-button"
            disabled={operation.busy}
            aria-busy={gatewayBusy}
            onClick={() => pay("gateway")}
          >
            {gatewayBusy
              ? "Đang tạo đơn GameStore Pay…"
              : "Thanh toán qua GameStore Pay"}
          </button>
        </section>
      )}
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
          <p className="commerce-error">
            {sandboxAvailable
              ? "Số dư ví chưa đủ. Bạn có thể chọn GameStore Pay ở trên."
              : "Số dư không đủ để mua trò chơi."}
          </p>
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <Link
              className="commerce-button primary"
              to="/wallet"
              onClick={close}
            >
              Mở ví
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
        <section
          className="checkout-payment-option checkout-wallet-option"
          aria-label="Ví GameStore"
        >
          <strong>
            {cents(price.final) === 0n ? "Thêm vào thư viện" : "Ví GameStore"}
          </strong>
          <small>
            {cents(price.final) === 0n
              ? "Game miễn phí, không trừ số dư ví."
              : "Thanh toán ngay bằng số dư hiện có trong ví."}
          </small>
          <div className="commerce-actions">
            <button
              className="commerce-button primary checkout-wallet-button"
              disabled={operation.busy}
              aria-busy={walletBusy}
              onClick={() => pay("wallet")}
            >
              {walletBusy
                ? "Đang thanh toán bằng ví…"
                : cents(price.final) === 0n
                  ? "Thêm miễn phí vào thư viện"
                  : "Thanh toán bằng ví"}
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
        </section>
      )}
    </Modal>
  );
}
