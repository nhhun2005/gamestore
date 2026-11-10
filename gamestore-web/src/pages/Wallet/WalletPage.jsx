import { useState } from "react";
import { Link } from "react-router-dom";
import { useCommerce } from "../../components/commerce/context";
import TopUpQrDialog from "./TopUpQrDialog";
import {
  PageHeader,
  TransactionTable,
} from "../../components/commerce/CommerceUI";
import { cents, money } from "../../services/currency";
export default function WalletPage() {
  const { state, user } = useCommerce();
  const [amount, setAmount] = useState("500000");
  const [confirm, setConfirm] = useState(false);
  const [pendingAmount, setPendingAmount] = useState("");
  const topupsEnabled =
    user.source === "demo" || state.capabilities?.demo_topups === true;
  let valid = false;
  try {
    const value = cents(amount);
    valid = value > 0n && value <= 10000000000n;
  } catch {
    /* Inline validation below. */
  }
  const account = state.users.find((u) => u.id === user.id);
  return (
    <main className="steam-main-content commerce-page">
      <PageHeader
        eyebrow="TÀI KHOẢN / VÍ STEAM STORE"
        title="Nạp năng lượng cho cuộc chơi."
      >
        Quản lý số dư và những hành trình tiếp theo của bạn.
      </PageHeader>
      <div className="wallet-columns">
        <section className="commerce-panel wallet-balance">
          <small>SỐ DƯ KHẢ DỤNG{user.source === "demo" ? " · DEMO" : ""}</small>
          <h2>{money(account.balance)}</h2>
          <p>Ví của {user.username}</p>
          <Link to="/transactions">Xem lịch sử giao dịch →</Link>
        </section>
        <section className="commerce-panel">
          <h2>Nạp tiền vào tài khoản</h2>
          <p>Chọn mệnh giá hoặc nhập số tiền tùy chỉnh.</p>
          <div className="deposit-options">
            {["100000", "200000", "500000", "1000000"].map((value) => (
              <button
                className={`commerce-button ${amount === value ? "selected" : ""}`}
                key={value}
                onClick={() => setAmount(value)}
              >
                {money(value)}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && topupsEnabled) {
                setPendingAmount(amount);
                setConfirm(true);
              }
            }}
          >
            <label htmlFor="deposit-amount">Số tiền tùy chỉnh (VND)</label>
            <input
              id="deposit-amount"
              className="commerce-input"
              inputMode="decimal"
              value={amount}
              aria-invalid={!valid}
              aria-describedby="deposit-help"
              onChange={(e) => setAmount(e.target.value)}
            />
            <p
              id="deposit-help"
              className={valid ? "commerce-note" : "commerce-error"}
            >
              {valid
                ? "Nhập số, có thể dùng dấu chấm cho phần thập phân (tối đa 2 chữ số)."
                : "Nhập số tiền lớn hơn 0, tối đa 100.000.000 ₫, tối đa 2 chữ số thập phân."}
            </p>
            <button
              className="commerce-button primary"
              disabled={!valid || !topupsEnabled}
            >
              Tiếp tục nạp tiền
            </button>
          </form>
          <p className="commerce-note">
            {user.source === "demo"
              ? "DEMO · Chỉ cập nhật dữ liệu mô phỏng, không kết nối ngân hàng hoặc thu tiền thật."
              : topupsEnabled
                ? "Nạp tiền bằng QR mô phỏng: xác nhận mã để cộng số dư, không chuyển tiền ngân hàng thật."
                : "Nạp tiền mô phỏng đang tắt trên máy chủ."}
          </p>
        </section>
      </div>
      <div className="commerce-section-title">
        <h2>Lần nạp gần đây</h2>
        <Link to="/transactions">Tất cả giao dịch →</Link>
      </div>
      <TransactionTable
        transactions={state.transactions
          .filter((t) => t.user_id === user.id && t.type === "IN")
          .slice(0, 5)}
        games={state.games}
      />
      {confirm && <TopUpQrDialog amount={pendingAmount} close={() => setConfirm(false)} />}
    </main>
  );
}
