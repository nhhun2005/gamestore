import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "../../components/commerce/CommerceUI";
import { useCommerce } from "../../components/commerce/context";
import { money } from "../../services/currency";
import "./WalletPage.css";

export default function TopUpQrDialog({ amount, close }) {
  const { service, notify } = useCommerce();
  const [challenge, setChallenge] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const active = useRef(false), sequence = useRef(0), locked = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; }, []);

  const generate = useCallback(async () => {
    if (locked.current) return;
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    setChallenge(null);
    setQrImage("");
    setCode("");
    try {
      const qr = await service.createTopUpChallenge(amount);
      if (!qr?.challenge_id || !qr.code || !Number.isFinite(Date.parse(qr.expires_at)))
        throw Error("Máy chủ chưa trả về mã QR hợp lệ. Vui lòng thử lại.");
      const image = await QRCode.toDataURL(qr.code, { width: 256, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
      if (!active.current || request !== sequence.current) return;
      setChallenge(qr);
      setQrImage(image);
      setNow(Date.now());
    } catch (failure) {
      if (active.current && request === sequence.current) setError(failure.message || "Không thể tạo QR. Vui lòng thử lại.");
    } finally {
      if (active.current && request === sequence.current) setLoading(false);
    }
  }, [amount, service]);

  useEffect(() => {
    active.current = true;
    // The microtask also prevents StrictMode's discarded first mount from issuing a request.
    const request = ++sequence.current;
    Promise.resolve().then(() => { if (active.current && sequence.current === request) generate(); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active.current = false; invalidate(); clearInterval(timer); };
  }, [generate, invalidate]);

  const seconds = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expires_at) - now) / 1000)) : 0;
  const expired = Boolean(challenge) && seconds === 0;

  async function confirm(event) {
    event.preventDefault();
    if (locked.current || loading || !challenge || !code.trim()) return;
    if (Date.now() >= Date.parse(challenge.expires_at)) { setNow(Date.now()); return; }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await service.topUp(challenge.amount, challenge.challenge_id, { challenge_id: challenge.challenge_id, code: code.trim() });
      if (!active.current) return;
      notify(`Đã nạp ${money(challenge.amount)} vào ví mô phỏng.`);
      close();
    } catch (failure) {
      if (active.current) setError(failure.message || "Không thể xác nhận nạp. Vui lòng thử lại.");
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }

  return (
    <Modal title="Nạp tiền bằng QR mô phỏng" close={close} busy={busy} error={error}>
      <div className="wallet-qr">
        <p className="wallet-qr-simulation">Mô phỏng — không chuyển tiền thật</p>
        <div className="wallet-qr-amount"><span>Số tiền nạp</span><strong>{money(challenge?.amount || amount)}</strong></div>
        <p>Quét QR để lấy mã, sau đó nhập mã bên dưới.</p>
        {loading ? <div className="wallet-qr-placeholder" role="status">Đang tạo mã QR…</div> : qrImage ? (
          <img className={`wallet-qr-image${expired ? " expired" : ""}`} src={qrImage} alt="QR nạp tiền mô phỏng" width={256} height={256} />
        ) : null}
        {challenge && (
          <p className={expired ? "wallet-qr-expired" : "wallet-qr-expiry"} role={expired ? "status" : undefined}>
            {expired ? "Mã QR đã hết hạn. Vui lòng tạo mã mới." : `Mã còn hiệu lực ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
          </p>
        )}
        <button type="button" className="commerce-button wallet-qr-regenerate" disabled={loading || busy} onClick={generate}>
          {challenge ? "Tạo QR mới" : "Thử lại"}
        </button>
        <form onSubmit={confirm} className="wallet-qr-form">
          <label htmlFor="topup-code">Mã xác nhận</label>
          <input id="topup-code" className="commerce-input wallet-qr-code" maxLength={32} value={code} onChange={(event) => setCode(event.target.value)}
            placeholder="Nhập mã đọc được từ QR" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} disabled={loading || busy || !challenge || expired} />
          <button type="submit" className="commerce-button primary" disabled={loading || busy || !challenge || !code.trim() || expired}>
            {busy ? "Đang xác nhận…" : "Xác nhận nạp"}
          </button>
        </form>
        <p className="commerce-note">Chỉ mã của yêu cầu này mới xác nhận được số tiền đang hiển thị. Đóng cửa sổ sẽ không cộng tiền.</p>
      </div>
    </Modal>
  );
}
