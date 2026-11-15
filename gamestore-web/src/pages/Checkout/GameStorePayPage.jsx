import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { useCommerce } from "../../components/commerce/context";
import { useOperation } from "../../components/commerce/useOperation";
import { money } from "../../services/currency";
import WithdrawalBankForm from "./WithdrawalBankForm";
import FakeBankCardForm from "./FakeBankCardForm";
import FakeBankPaymentResult from "./FakeBankPaymentResult";
import "./GameStorePay.css";

// Bank logos from the VietQR bank directory: https://api.vietqr.io/v2/banks
const banks = [
  { id: "NCB", name: "NCB", logo: "/banks/NCB.png" },
  { id: "VIETCOMBANK", name: "Vietcombank", logo: "/banks/VCB.png" },
  { id: "BIDV", name: "BIDV", logo: "/banks/BIDV.png" },
  { id: "TECHCOMBANK", name: "Techcombank", logo: "/banks/TCB.png" },
];
export default function GameStorePayPage() {
  const { id } = useParams();
  const { service, state, user } = useCommerce();
  const [retry, setRetry] = useState(0);
  const key = `${id}:${retry}`;
  const [result, setResult] = useState({ key: "", payment: null, error: "" });
  const payment = result.key === key ? result.payment : null;
  const [method, setMethod] = useState("CARD");
  const [bank, setBank] = useState("NCB");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState({ payload: "", image: "", error: "" });
  const [now, setNow] = useState(() => Date.now());
  const operation = useOperation();
  const updatePayment = (value) =>
    setResult({ key, payment: value, error: "" });

  useEffect(() => {
    let active = true;
    if (user.source === "jwt")
      service
        .checkout(id)
        .then((value) => {
          if (active) setResult({ key, payment: value, error: "" });
        })
        .catch((error) => {
          if (active) setResult({ key, payment: null, error: error.message });
        });
    return () => {
      active = false;
    };
  }, [id, service, key, user.source]);
  useEffect(() => {
    if (
      user.source !== "jwt" ||
      payment?.status !== "PENDING" ||
      operation.busy
    )
      return;
    let active = true,
      refreshing = false;
    const refresh = () => {
      if (!active || refreshing || document.visibilityState === "hidden")
        return;
      refreshing = true;
      service
        .checkout(id)
        .then((value) => {
          if (active)
            setResult((current) =>
              current.key === key &&
              current.payment &&
              current.payment.status !== "PENDING"
                ? current
                : { key, payment: value, error: "" },
            );
        })
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    const poll = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id, service, key, user.source, payment?.status, operation.busy]);
  useEffect(() => {
    if (payment?.status !== "PENDING") return;
    let active = true;
    let refreshing = false;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= Date.parse(payment.expires_at) && !refreshing) {
        refreshing = true;
        service
          .checkout(id)
          .then((value) => {
            if (active) setResult({ key, payment: value, error: "" });
          })
          .catch(() => {
            refreshing = false;
          });
      }
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [payment, service, id, key]);
  useEffect(() => {
    let active = true;
    if (payment?.qr_payload)
      QRCode.toDataURL(payment.qr_payload, { width: 248, margin: 2 })
        .then((image) => {
          if (active) setQr({ payload: payment.qr_payload, image, error: "" });
        })
        .catch(() => {
          if (active)
            setQr({
              payload: payment.qr_payload,
              image: "",
              error:
                "Không tạo được mã QR. Hãy tải lại hoặc chọn thẻ ngân hàng.",
            });
        });
    return () => {
      active = false;
    };
  }, [payment?.qr_payload]);
  const remaining = payment
    ? Math.max(0, Math.ceil((Date.parse(payment.expires_at) - now) / 1000))
    : 0;
  const timeText = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`;
  const pending = payment?.status === "PENDING";
  const topup = payment?.purpose === "TOPUP";
  const withdrawal = payment?.purpose === "WITHDRAWAL";
  const walletFlow = topup || withdrawal;
  const home = user.role === "ADMINISTRATOR" ? "/admin/revenue" : "/store";
  const payDisabled =
    operation.busy ||
    remaining === 0 ||
    !state.capabilities?.sandbox_payments ||
    (topup && !state.capabilities?.sandbox_topups) ||
    (withdrawal && !state.capabilities?.sandbox_withdrawals);
  const amountText = payment ? money(payment.amount) : "";
  function confirm(fields) {
    operation.run(
      () => service.confirmCheckout(id, { method, bank, ...fields }),
      updatePayment,
    );
  }
  return (
    <main className="gs-pay">
      <header className="gs-pay-header">
        <Link to={home} className="gs-pay-brand">
          <span aria-hidden="true">G</span>GameStore <b>Pay</b>
        </Link>
        <span className="gs-pay-sandbox">SANDBOX</span>
        <span className="gs-pay-secure">Thanh toán qua GameStore</span>
      </header>
      <nav className="gs-pay-steps" aria-label="Tiến trình thanh toán">
        <span className="complete">
          1 <b>{withdrawal ? "Yêu cầu" : "Đơn hàng"}</b>
        </span>
        <i />
        <span className={pending ? "active" : "complete"}>
          2 <b>{withdrawal ? "Ngân hàng nhận" : "Thanh toán"}</b>
        </span>
        <i />
        <span className={payment && !pending ? "active" : ""}>
          3 <b>Hoàn tất</b>
        </span>
      </nav>
      {user.source !== "jwt" ? (
        <section className="gs-pay-panel">
          <h1>Vui lòng đăng nhập để thanh toán</h1>
          <Link to="/login">Đăng nhập</Link>
        </section>
      ) : result.key !== key ? (
        <p role="status" className="gs-pay-loading">
          Đang tải đơn thanh toán…
        </p>
      ) : result.error ? (
        <section className="gs-pay-panel">
          <h1>Chưa tải được đơn thanh toán</h1>
          <p className="gs-pay-error" role="alert">
            {result.error}
          </p>
          <button className="gs-pay-submit" onClick={() => setRetry(retry + 1)}>
            Thử lại
          </button>
          <Link to={home} className="gs-pay-return">
            Về trang chính
          </Link>
        </section>
      ) : (
        payment && (
          <>
            {operation.error && (
              <p role="alert" className="gs-pay-error gs-pay-operation-error">
                {operation.error}
              </p>
            )}
            {pending ? (
              <div className="gs-pay-layout">
                <aside className="gs-pay-order">
                  <small>{withdrawal ? "RÚT TIỀN TỪ" : "THANH TOÁN CHO"}</small>
                  <h2>GameStore</h2>
                  <div className="gs-pay-product">
                    <span aria-hidden="true">◇</span>
                    <div>
                      <h3>{payment.game_title}</h3>
                      <small>
                        {walletFlow
                          ? `Tài khoản ${user.username} · Ví GameStore`
                          : "Phiên bản kỹ thuật số · 1 trò chơi"}
                      </small>
                    </div>
                  </div>
                  <dl className="payment-summary">
                    <div>
                      <dt>Mã đơn hàng</dt>
                      <dd title={payment.id}>
                        {payment.id.slice(0, 8).toUpperCase()}
                      </dd>
                    </div>
                    <div>
                      <dt>{withdrawal ? "Số tiền rút" : topup ? "Số tiền nạp" : "Đơn giá sau ưu đãi"}</dt>
                      <dd>{amountText}</dd>
                    </div>
                    <div>
                      <dt>Phí thanh toán</dt>
                      <dd>0 ₫</dd>
                    </div>
                    <div className="gs-pay-total">
                      <dt>{withdrawal ? "Tổng tiền rút" : "Tổng thanh toán"}</dt>
                      <dd>{amountText}</dd>
                    </div>
                  </dl>
                  <div
                    className={`gs-pay-countdown ${remaining < 60 ? "ending" : ""}`}
                    role="timer"
                    aria-label="Thời gian thanh toán"
                  >
                    Đơn hàng còn hiệu lực <strong>{timeText}</strong>
                  </div>
                  <button
                    className="gs-pay-cancel"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(
                        () => service.cancelCheckout(id),
                        updatePayment,
                      )
                    }
                  >
                    {withdrawal ? "Hủy yêu cầu" : "Hủy thanh toán"}
                  </button>
                  <Link
                    className="gs-pay-return"
                    to={
                      walletFlow
                        ? "/wallet"
                        : `/games/${encodeURIComponent(payment.game_id)}`
                    }
                  >
                    {walletFlow ? "Quay lại ví" : "Quay lại trò chơi"}
                  </Link>
                </aside>
                <section className="gs-pay-panel">
                  <h1>
                    {withdrawal ? "Chọn ngân hàng nhận tiền" : topup
                      ? "Chọn phương thức nạp tiền"
                      : "Chọn phương thức thanh toán"}
                  </h1>
                  {!state.capabilities?.sandbox_payments && (
                    <p role="alert" className="gs-pay-error">
                      GameStore Pay đang tạm ngừng. Bạn có thể hủy đơn và thanh
                      toán bằng ví.
                    </p>
                  )}
                  {!withdrawal && <div
                    className="gs-pay-methods"
                    role="group"
                    aria-label="Phương thức thanh toán"
                  >
                    <button
                      type="button"
                      className={method === "CARD" ? "selected" : ""}
                      aria-pressed={method === "CARD"}
                      disabled={operation.busy}
                      onClick={() => setMethod("CARD")}
                    >
                      <span aria-hidden="true">▤</span>Thẻ ngân hàng
                    </button>
                    <button
                      type="button"
                      className={method === "QR" ? "selected" : ""}
                      aria-pressed={method === "QR"}
                      disabled={operation.busy}
                      onClick={() => setMethod("QR")}
                    >
                      <span aria-hidden="true">▦</span>Quét mã QR
                    </button>
                  </div>}
                  <fieldset className="gs-pay-banks" disabled={operation.busy}>
                    <legend>{withdrawal ? "Ngân hàng nhận tiền" : "Ngân hàng thanh toán"}</legend>
                    {banks.map((entry) => (
                      <label
                        key={entry.id}
                        className={bank === entry.id ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          name="bank"
                          value={entry.id}
                          checked={bank === entry.id}
                          onChange={() => setBank(entry.id)}
                        />
                        <img className="gs-pay-bank-logo" src={entry.logo} alt="" />
                        <span className="gs-pay-bank-name">{entry.name}</span>
                      </label>
                    ))}
                  </fieldset>
                  {withdrawal ? (
                    <WithdrawalBankForm busy={operation.busy} disabled={payDisabled} amountText={amountText} confirm={confirm} />
                  ) : method === "CARD" ? (
                    <FakeBankCardForm
                      busy={operation.busy}
                      disabled={payDisabled}
                      amountText={amountText}
                      confirm={confirm}
                    />
                  ) : (
                    <form
                      className="gs-pay-qr"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!payDisabled) confirm({ qr_code: code.trim() });
                      }}
                    >
                      {qr.payload === payment.qr_payload && qr.image ? (
                        <img src={qr.image} alt="QR thanh toán GameStore Pay" />
                      ) : qr.error ? (
                        <p role="alert" className="gs-pay-error">
                          {qr.error}
                        </p>
                      ) : (
                        <p role="status">Đang tạo mã QR…</p>
                      )}
                      <p>Quét QR để lấy mã xác nhận của đơn hàng.</p>
                      <label htmlFor="checkout-qr-code">Mã xác nhận QR</label>
                      <input
                        id="checkout-qr-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        maxLength={36}
                        autoComplete="off"
                        placeholder="Nhập mã code đọc được từ QR"
                        disabled={payDisabled}
                        required
                      />
                      <button
                        className="gs-pay-submit"
                        disabled={payDisabled || !code.trim()}
                      >
                        {operation.busy
                          ? "Đang xác nhận thanh toán…"
                          : `Xác nhận thanh toán ${amountText}`}
                      </button>
                    </form>
                  )}
                  <footer className="gs-pay-provider-note">
                    GameStore Pay · Thanh toán thử nghiệm
                  </footer>
                </section>
              </div>
            ) : (
              <div className="gs-pay-panel gs-pay-result-panel">
                <FakeBankPaymentResult
                  payment={payment}
                  amountText={amountText}
                />
              </div>
            )}
          </>
        )
      )}
    </main>
  );
}
