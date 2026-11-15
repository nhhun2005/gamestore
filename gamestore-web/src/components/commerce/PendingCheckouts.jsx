import { Link } from "react-router-dom";
import { useCommerce } from "./context";
import { useOperation } from "./useOperation";
import { money } from "../../services/currency";

export default function PendingCheckouts({ purpose }) {
  const { state, service, notify } = useCommerce();
  const operation = useOperation();
  const rows = (state.checkout_sessions || []).filter(
    (c) => c.status === "PENDING" && (!purpose || c.purpose === purpose),
  );
  if (!rows.length) return null;
  const title =
    purpose === "WITHDRAWAL" ? "Đơn rút tiền đang chờ" : purpose === "TOPUP"
      ? "Đơn nạp tiền đang chờ"
      : "Đơn GameStore Pay đang chờ";
  return (
    <section
      className="commerce-panel checkout-pending-orders"
      aria-label={title}
    >
      <div className="commerce-section-title">
        <h2>{title}</h2>
        <button
          className="commerce-button"
          disabled={operation.busy}
          onClick={() => operation.run(() => service.prepareAccount())}
        >
          Cập nhật trạng thái
        </button>
      </div>
      {operation.error && (
        <p className="commerce-error" role="alert">
          {operation.error}
        </p>
      )}
      {rows.map((row) => (
        <div className="pending-checkout-row" key={row.id}>
          <div>
            <strong>{row.game_title}</strong>
            <small>
              Đơn {row.id.slice(0, 8).toUpperCase()} · {money(row.amount)} · Hạn
              thanh toán{" "}
              {new Date(row.expires_at).toLocaleTimeString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh",
              })}
            </small>
          </div>
          <div className="commerce-actions">
            <Link
              className="commerce-button primary"
              to={`/checkout/${encodeURIComponent(row.id)}`}
            >
              {row.purpose === "WITHDRAWAL" ? "Tiếp tục rút tiền" : "Tiếp tục thanh toán"}
            </Link>
            <button
              className="commerce-button"
              disabled={operation.busy}
              onClick={() =>
                operation.run(
                  () => service.cancelCheckout(row.id),
                  () => notify("Đã hủy đơn thanh toán."),
                )
              }
            >
              Hủy đơn
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
