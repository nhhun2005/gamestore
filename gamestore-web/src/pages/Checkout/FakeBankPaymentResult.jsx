// Adapted from Fake-bank checkout PaymentState/SuccessResult, Apache-2.0.
// Source revision and changes: /third_party/fake-bank/NOTICE.
import { Link } from "react-router-dom";
const states = {
  SUCCESSED: {
    title: "Thanh toán thành công",
    detail: "Trò chơi đã được thêm vào thư viện của bạn.",
    icon: "✓",
  },
  FAILED: {
    title: "Thanh toán không thành công",
    detail:
      "Thẻ thử nghiệm đã bị từ chối. Bạn có thể tạo đơn mới và chọn thẻ khác.",
    icon: "!",
  },
  CANCELLED: {
    title: "Đã hủy thanh toán",
    detail: "Đơn hàng đã được hủy. Chưa cấp game hoặc trừ số dư ví.",
    icon: "×",
  },
  EXPIRED: {
    title: "Đơn thanh toán đã hết hạn",
    detail: "Thời gian thanh toán đã kết thúc. Hãy tạo đơn mới để tiếp tục.",
    icon: "◷",
  },
};
export default function FakeBankPaymentResult({ payment, amountText }) {
  const state = states[payment.status];
  const topup = payment.purpose === "TOPUP";
  const withdrawal = payment.purpose === "WITHDRAWAL";
  const walletFlow = topup || withdrawal;
  if (!state) return null;
  return (
    <section
      className={`gs-pay-result result-${payment.status.toLowerCase()}`}
      aria-labelledby="payment-result-title"
    >
      <span className="gs-pay-result-icon" aria-hidden="true">
        {state.icon}
      </span>
      <h1 id="payment-result-title">
        {withdrawal ? ({ SUCCESSED: "Rút tiền thành công", FAILED: "Rút tiền không thành công", CANCELLED: "Đã hủy rút tiền", EXPIRED: "Yêu cầu rút tiền đã hết hạn" }[payment.status]) : topup && payment.status === "SUCCESSED"
          ? "Nạp tiền thành công"
          : state.title}
      </h1>
      <p>
        {withdrawal ? (payment.status === "SUCCESSED" ? `Đã rút ${amountText} từ ví GameStore.` : payment.reason === "insufficient_funds" ? "Số dư không đủ. Ví chưa bị trừ tiền." : "Ví chưa bị trừ tiền.") : topup && payment.status === "SUCCESSED"
          ? `Đã cộng ${amountText} vào ví GameStore của bạn.`
          : topup && payment.status === "CANCELLED"
            ? "Đơn nạp tiền đã được hủy. Số dư ví chưa thay đổi."
            : state.detail}
      </p>
      <dl className="result-summary" aria-label="Biên nhận thanh toán">
        <div>
          <dt>Mã đơn hàng</dt>
          <dd>{payment.id}</dd>
        </div>
        <div>
          <dt>{walletFlow ? "Nội dung" : "Trò chơi"}</dt>
          <dd>{payment.game_title}</dd>
        </div>
        <div>
          <dt>{withdrawal ? "Số tiền rút" : "Tổng thanh toán"}</dt>
          <dd>{amountText}</dd>
        </div>
        {payment.bank && (
          <div>
            <dt>Ngân hàng</dt>
            <dd>{payment.bank}</dd>
          </div>
        )}
        {payment.card_last4 && (
          <div>
            <dt>{withdrawal ? "Tài khoản nhận" : "Thẻ thanh toán"}</dt>
            <dd>•••• {payment.card_last4}</dd>
          </div>
        )}
        {payment.settled_at && (
          <div>
            <dt>Thời gian</dt>
            <dd>
              {new Date(payment.settled_at).toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </dd>
          </div>
        )}
      </dl>
      {payment.status === "SUCCESSED" ? (
        <Link className="gs-pay-submit" to={walletFlow ? "/wallet" : "/library"}>
          {walletFlow ? "Về ví của tôi" : "Mở thư viện"}
        </Link>
      ) : (
        <Link
          className="gs-pay-submit"
          to={
            walletFlow ? "/wallet" : `/games/${encodeURIComponent(payment.game_id)}`
          }
        >
          {walletFlow ? "Quay lại ví" : "Quay lại trò chơi"}
        </Link>
      )}
      <Link className="gs-pay-return" to="/transactions">
        Xem lịch sử giao dịch
      </Link>
    </section>
  );
}
