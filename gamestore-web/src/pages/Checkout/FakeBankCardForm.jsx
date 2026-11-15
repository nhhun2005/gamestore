// Adapted from nick-roust/fake-bank at 6552155550ae5ae3d595d946bf001026617bef8a.
// Apache-2.0; see /third_party/fake-bank/LICENSE and NOTICE.
// Modified: Vietnamese labels, test-card presets and authenticated merchant submit.
import { useState } from "react";

export default function FakeBankCardForm({
  busy,
  disabled = false,
  amountText,
  confirm,
}) {
  const locked = busy || disabled;
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "" });
  const [formError, setFormError] = useState("");
  const normalizeDigits = (value) => value.replace(/\D/g, "");
  function validateCard() {
    if (!/^[0-9]{12,19}$/.test(card.number))
      return "Nhập số thẻ thử nghiệm được cung cấp bên dưới.";
    if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(card.expiry))
      return "Nhập hạn thẻ theo định dạng MM/YY.";
    if (!/^[0-9]{3,4}$/.test(card.cvv)) return "CVV gồm 3 hoặc 4 chữ số.";
    return "";
  }
  return (
    <form
      className="card-form"
      onSubmit={(event) => {
        event.preventDefault();
        const error = validateCard();
        setFormError(error);
        if (!error && !locked)
          confirm({
            card_number: card.number,
            expiry: card.expiry,
            cvv: card.cvv,
          });
      }}
    >
      <div className="gs-pay-test-cards">
        <small>THẺ THỬ NGHIỆM</small>
        <div>
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              setCard({
                number: "4242424242424242",
                expiry: "12/35",
                cvv: "123",
              })
            }
          >
            Dùng thẻ thành công
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() =>
              setCard({
                number: "4000000000000002",
                expiry: "12/35",
                cvv: "123",
              })
            }
          >
            Dùng thẻ bị từ chối
          </button>
        </div>

      </div>
      <label>
        <span>Số thẻ</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={card.number}
          onChange={(e) =>
            setCard({ ...card, number: normalizeDigits(e.target.value) })
          }
          placeholder="4242 4242 4242 4242"
          maxLength={19}
          disabled={locked}
          required
        />
      </label>
      <div className="form-row">
        <label>
          <span>Hạn thẻ</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={card.expiry}
            onChange={(e) => setCard({ ...card, expiry: e.target.value })}
            placeholder="MM/YY"
            maxLength={5}
            disabled={locked}
            required
          />
        </label>
        <label>
          <span>CVV</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={card.cvv}
            onChange={(e) =>
              setCard({ ...card, cvv: normalizeDigits(e.target.value) })
            }
            placeholder="123"
            maxLength={4}
            disabled={locked}
            required
          />
        </label>
      </div>
      {formError && (
        <p className="gs-pay-error" role="alert">
          {formError}
        </p>
      )}
      <button className="gs-pay-submit" type="submit" disabled={locked}>
        {busy ? "Đang xác nhận thanh toán…" : `Thanh toán ${amountText}`}
      </button>
    </form>
  );
}
