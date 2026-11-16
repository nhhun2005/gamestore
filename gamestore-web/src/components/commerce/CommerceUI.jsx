import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { cents, decimal, dayOf, money, priceOf } from "../../services/currency";
export function Modal({ title, close, busy, error, children, className = "" }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      className={`commerce-dialog ${className}`}
      ref={dialog}
      aria-labelledby="commerce-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="dialog-title">
        <h2 id="commerce-dialog-title">{title}</h2>
        <button
          className="commerce-button"
          disabled={busy}
          onClick={close}
          aria-label="Đóng hộp thoại"
        >
          ×
        </button>
      </div>
      {error && (
        <p className="commerce-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
export function Artwork({ game, large = false }) {
  return (
    <div className={`game-art ${large ? "large-art" : ""}`}>
      <span>{game.title}</span>
      {game.cover_image_url && (
        <img
          src={game.cover_image_url}
          alt={game.title}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}
export function PriceDisplay({ game, promotions }) {
  const price = priceOf(game, promotions);
  return (
    <div className="commerce-price">
      {price.discount !== "0" && (
        <>
          <span className="discount">−{price.discount}%</span>
          <del>{money(price.original)}</del>
        </>
      )}
      <strong>
        {cents(price.final) === 0n ? "Miễn phí" : money(price.final)}
      </strong>
    </div>
  );
}
export function PageHeader({ eyebrow, title, children }) {
  return (
    <div className="commerce-heading">
      <small>{eyebrow}</small>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
export function EmptyState({ title, children, store = false }) {
  return (
    <div className="commerce-empty">
      <span aria-hidden="true">◇</span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {store && (
        <Link className="commerce-button primary" to="/store">
          Khám phá cửa hàng →
        </Link>
      )}
    </div>
  );
}
export function TransactionTable({ transactions, games, checkouts = [] }) {
  if (!transactions.length)
    return <EmptyState title="Chưa có giao dịch phù hợp" />;
  return (
    <div className="commerce-table-scroll">
      <table className="steam-table commerce-table">
        <thead>
          <tr>
            <th>Giao dịch / Thời gian</th>
            <th>Loại</th>
            <th>Nội dung</th>
            <th>Số tiền</th>
            <th>Trạng thái</th>
            {checkouts.length > 0 && <th>Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {transactions.map((row) => {
            const checkout = checkouts.find((c) => c.transaction_id === row.id);
            const status = checkout?.status || row.status;
            const settled = row.status === "SUCCESSED";
            return (
              <tr key={row.id}>
                <td>
                  <code title={row.id}>{row.id.slice(0, 8)}</code>
                  <small>
                    {new Date(row.created_at).toLocaleString("vi-VN", {
                      timeZone: "Asia/Ho_Chi_Minh",
                    })}
                  </small>
                </td>
                <td>
                  {
                    { IN: row.source_purchase_id ? "Doanh thu" : "Nạp tiền", OUT: "Chi tiền", BUY: "Mua game" }[
                      row.type
                    ]
                  }
                  <small>{row.type}</small>
                </td>
                <td>
                  {row.source_purchase_id ? ({ DEVELOPER: "Tiền bán game", PLATFORM_FEE: "Phí sàn bán game", ADMIN_SALE: "Tiền bán game của admin" }[row.income_kind] || "Doanh thu bán game") : checkout?.purpose === "TOPUP"
                    ? "Nạp vào ví GameStore"
                    : games.find((g) => g.id === row.game_id)?.title || "—"}
                </td>
                <td className={row.type === "IN" && settled ? "positive" : ""}>
                  {settled ? (row.type === "IN" ? "+" : "−") : ""}
                  {money(row.amount)}
                </td>
                <td>
                  <span className={`transaction-status ${status}`}>
                    {
                      {
                        PENDING: checkout ? "Chờ thanh toán" : "Đang xử lý",
                        SUCCESSED: "Thành công",
                        FAILED: "Thất bại",
                        CANCELLED: "Đã hủy",
                        EXPIRED: "Hết hạn",
                      }[status]
                    }
                  </span>
                </td>
                {checkouts.length > 0 && (
                  <td>
                    {checkout && (
                      <Link
                        className="commerce-button"
                        to={`/checkout/${encodeURIComponent(checkout.id)}`}
                      >
                        {status === "PENDING"
                          ? "Tiếp tục thanh toán"
                          : "Xem biên nhận"}
                      </Link>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export function RevenueChart({ rows }) {
  const points = Object.entries(
    rows.reduce((groups, row) => {
      const day = dayOf(row.created_at);
      groups[day] = (groups[day] || 0n) + cents(row.amount);
      return groups;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const maximum = points.reduce(
    (max, [, value]) => (value > max ? value : max),
    1n,
  );
  return (
    <div
      className="revenue-chart"
      role="img"
      aria-label="Doanh thu gộp theo ngày. Số tiền hiển thị trên từng cột."
    >
      {points.map(([day, value]) => (
        <div className="chart-column" key={day}>
          <span>{money(decimal(value))}</span>
          <div className="chart-track">
            <div
              className="chart-bar"
              style={{
                height: `${Math.max(2, Number((value * 10000n) / maximum) / 100)}%`,
              }}
            />
          </div>
          <small>{day}</small>
        </div>
      ))}
    </div>
  );
}
