import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/commerce/CommerceUI";
import { useCommerce } from "../../components/commerce/context";
import { useOperation } from "../../components/commerce/useOperation";
import { cents, money } from "../../services/currency";

export default function WithdrawDialog({ close, balance }) {
  const { service } = useCommerce();
  const navigate = useNavigate();
  const operation = useOperation();
  const request = useRef({ key: crypto.randomUUID(), amount: "" });
  const [amount, setAmount] = useState("");
  let valid = false;
  try {
    const value = cents(amount);
    valid = value > 0n && value <= cents(balance) && value <= 10000000000n;
  } catch { /* Invalid amounts are shown inline. */ }
  return (
    <Modal title="Rút tiền" close={close} busy={operation.busy} error={operation.error}>
      <small>GAME STORE PAY · SANDBOX</small>
      <p>Số dư khả dụng: <strong>{money(balance)}</strong></p>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        if (request.current.amount !== amount)
          request.current = { key: crypto.randomUUID(), amount };
        operation.run(() => service.withdraw(amount, request.current.key), (payment) =>
          navigate(`/checkout/${encodeURIComponent(payment.id)}`));
      }}>
        <label htmlFor="withdraw-amount">Số tiền rút (VND)</label>
        <input id="withdraw-amount" className="commerce-input" inputMode="decimal"
          value={amount} onChange={(event) => setAmount(event.target.value)}
          disabled={operation.busy} aria-invalid={!!amount && !valid} autoFocus />
        {!!amount && !valid && <p className="commerce-error">Số tiền phải lớn hơn 0, không vượt số dư và tối đa 100.000.000 ₫.</p>}
        <div className="dialog-actions">
          <button type="button" className="commerce-button" onClick={close} disabled={operation.busy}>Hủy</button>
          <button className="commerce-button primary" disabled={!valid || operation.busy}>
            {operation.busy ? "Đang tạo đơn…" : "Tiếp tục rút tiền"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
