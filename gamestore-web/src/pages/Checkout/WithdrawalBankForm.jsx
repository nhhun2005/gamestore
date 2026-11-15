import { useState } from "react";

export default function WithdrawalBankForm({ busy, disabled, amountText, confirm }) {
  const [account, setAccount] = useState("");
  return (
    <form className="card-form" onSubmit={(event) => {
      event.preventDefault();
      if (!disabled && account) confirm({ method: "BANK", recipient_account: account });
    }}>
      <div className="gs-pay-test-cards">
        <small>TÀI KHOẢN THỬ NGHIỆM</small>
        <div>
          <button type="button" disabled={disabled} onClick={() => setAccount("9704000001")}>Dùng tài khoản thành công</button>
          <button type="button" disabled={disabled} onClick={() => setAccount("9704000002")}>Dùng tài khoản bị từ chối</button>
        </div>
      </div>
      <label><span>Số tài khoản nhận tiền</span>
        <input inputMode="numeric" autoComplete="off" maxLength={10} required disabled={disabled}
          value={account} onChange={(event) => setAccount(event.target.value.replace(/\D/g, ""))} placeholder="9704000001" />
      </label>
      <button className="gs-pay-submit" disabled={disabled || !account}>
        {busy ? "Đang xác nhận rút tiền…" : `Xác nhận rút ${amountText}`}
      </button>
    </form>
  );
}
