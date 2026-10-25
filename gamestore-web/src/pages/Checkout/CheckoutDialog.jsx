import { Link } from "react-router-dom";
import { useState } from "react";
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
  const operation = useOperation();
  const account = state.users.find((u) => u.id === user.id);
  const owned =
    import.meta.env.DEV &&
    state.game_bought.some(
      (p) => p.game_id === game.id && p.user_id === user.id,
    );
  const price = priceOf(game, state.promotions);
  const insufficient = cents(account?.balance || "0") < cents(price.final);
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
      {import.meta.env.DEV && (
        <p>
          Số dư ví mô phỏng: <strong>{money(account?.balance || "0")}</strong>
        </p>
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
      ) : !import.meta.env.DEV ? (
        <p>
          API mua game chưa được tích hợp. Phiên đăng nhập thật của bạn đang
          hoạt động; không thực hiện thanh toán mô phỏng trong production.
        </p>
      ) : game.status !== "AVAILABLE" ? (
        <p className="commerce-error">Trò chơi hiện chưa mở bán.</p>
      ) : insufficient ? (
        <>
          <p className="commerce-error">Số dư không đủ để mua trò chơi.</p>
          <Link
            className="commerce-button primary"
            to="/wallet"
            onClick={close}
          >
            Nạp tiền Demo
          </Link>
        </>
      ) : (
        <>
          <p className="commerce-note">
            DEMO · Một game mỗi giao dịch. Không phát sinh thanh toán thật.
          </p>
          <button
            className="commerce-button primary"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => service.purchase(game.id),
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
        </>
      )}
    </Modal>
  );
}
