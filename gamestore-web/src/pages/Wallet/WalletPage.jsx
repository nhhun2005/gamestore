import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCommerce } from "../../components/commerce/context";
import { useOperation } from "../../components/commerce/useOperation";
import {
  Modal,
  PageHeader,
  TransactionTable,
} from "../../components/commerce/CommerceUI";
import { cents, money } from "../../services/currency";
export default function WalletPage() {
  const { state, user, service, notify } = useCommerce();
  const [amount, setAmount] = useState("500000");
  const [confirm, setConfirm] = useState(false);
  const operation = useOperation();
  const requestKey = useRef("");
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
                requestKey.current = crypto.randomUUID();
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
              disabled={!valid || operation.busy || !topupsEnabled}
            >
              Tiếp tục nạp tiền
            </button>
          </form>
          <p className="commerce-note">
            {user.source === "demo"
              ? "DEMO · Chỉ cập nhật dữ liệu mô phỏng, không kết nối ngân hàng hoặc thu tiền thật."
              : topupsEnabled
                ? "Nạp tiền thử nghiệm: số dư được ghi vào database, không thu tiền ngân hàng thật."
                : "Chưa tích hợp cổng thanh toán. Nạp tiền thử nghiệm chỉ bật khi backend chạy profile local."}
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
      {confirm && (
        <Modal
          title="Xác nhận nạp tiền DEMO"
          close={() => setConfirm(false)}
          {...operation}
        >
          <p>
            Thêm <strong>{money(amount)}</strong>{" "}
            {user.source === "demo"
              ? "vào ví mô phỏng?"
              : "vào số dư database bằng khoản nạp thử nghiệm?"}
          </p>
          <p>Không có khoản thanh toán thật nào được thực hiện.</p>
          <button
            className="commerce-button primary"
            disabled={operation.busy}
            onClick={() =>
              operation.run(
                () => service.topUp(amount, requestKey.current),
                () => {
                  setConfirm(false);
                  notify(
                    user.source === "demo"
                      ? "Đã nạp tiền vào ví mô phỏng."
                      : "Đã ghi nhận khoản nạp thử nghiệm vào database.",
                  );
                },
              )
            }
          >
            {operation.busy ? "Đang xử lý…" : "Xác nhận nạp"}
          </button>
        </Modal>
      )}
    </main>
  );
}
