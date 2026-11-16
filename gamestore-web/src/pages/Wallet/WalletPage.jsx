import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCommerce } from "../../components/commerce/context";
import TopUpQrDialog from "./TopUpQrDialog";
import WithdrawDialog from "./WithdrawDialog";
import { useOperation } from "../../components/commerce/useOperation";
import PendingCheckouts from "../../components/commerce/PendingCheckouts";
import {
  PageHeader,
  TransactionTable,
} from "../../components/commerce/CommerceUI";
import { cents, money } from "../../services/currency";
export default function WalletPage() {
  const { state, user, service } = useCommerce();
  const navigate = useNavigate();
  const operation = useOperation();
  const requestKey = useRef(crypto.randomUUID());
  const sandboxTopups =
    user.source === "jwt" && state.capabilities?.sandbox_topups;
  const [amount, setAmount] = useState("500000");
  const [confirm, setConfirm] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const canWithdraw = ["ADMINISTRATOR", "DEVELOPER"].includes(user.role);
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
        eyebrow="TÀI KHOẢN / VÍ GAME STORE"
        title="Ví của tôi"
      />
      <div className="wallet-columns">
        <section className="commerce-panel wallet-balance">
          <small>SỐ DƯ KHẢ DỤNG</small>
          <h2>{money(account.balance)}</h2>
          <p>Ví của {user.username}</p>
          {canWithdraw && <p><button className="commerce-button primary"
            disabled={!state.capabilities?.sandbox_withdrawals}
            onClick={() => setWithdrawing(true)}>Rút tiền</button></p>}
          <Link to="/transactions">Xem lịch sử giao dịch →</Link>
        </section>
        <section className="commerce-panel">
          <h2>Nạp tiền vào tài khoản</h2>
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
                if (sandboxTopups)
                  operation.run(
                    () =>
                      service.createTopUpCheckout(amount, requestKey.current),
                    (payment) =>
                      navigate(`/checkout/${encodeURIComponent(payment.id)}`),
                  );
                else {
                  setPendingAmount(amount);
                  setConfirm(true);
                }
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
              {!valid && "Nhập số tiền lớn hơn 0, tối đa 100.000.000 ₫, tối đa 2 chữ số thập phân."}
            </p>
            <button
              className="commerce-button primary"
              disabled={!valid || !topupsEnabled || operation.busy}
            >
              {operation.busy ? "Đang tạo đơn nạp tiền…" : "Tiếp tục nạp tiền"}
            </button>
          </form>
          {operation.error && (
            <p role="alert" className="commerce-error">
              {operation.error}
            </p>
          )}
          {!topupsEnabled && (
            <p className="commerce-note">
              Nạp tiền đang tạm ngừng trên máy chủ.
            </p>
          )}
        </section>
      </div>
      <PendingCheckouts purpose="TOPUP" />
      {canWithdraw && <PendingCheckouts purpose="WITHDRAWAL" />}
      <div className="commerce-section-title">
        <h2>{canWithdraw ? "Tiền vào ví gần đây" : "Lần nạp gần đây"}</h2>
        <Link to="/transactions">Tất cả giao dịch →</Link>
      </div>
      <TransactionTable
        transactions={state.transactions
          .filter((t) => t.user_id === user.id && t.type === "IN")
          .slice(0, 5)}
        games={state.games}
        checkouts={state.checkout_sessions}
      />
      {confirm && (
        <TopUpQrDialog amount={pendingAmount} close={() => setConfirm(false)} />
      )}
      {withdrawing && <WithdrawDialog balance={account.balance} close={() => setWithdrawing(false)} />}
    </main>
  );
}
