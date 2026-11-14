import { useState } from "react";
import { API_BASE_URL } from "../../utils/auth";
import "../Login/Auth.css";

const RESEND_API = `${import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api"}/auth`;

function RegisterPage({ onNavigate }) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (form.password !== form.confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || "Đăng ký thất bại.");
      } else {
        // Hiển thị thông báo kiểm tra email thay vì tự đăng nhập
        setRegistered(true);
        setRegisteredEmail(form.email);
      }
    } catch {
      setErrorMsg(
        "Không thể kết nối tới máy chủ Backend (http://localhost:8080).",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMsg("");
    try {
      const res = await fetch(`${RESEND_API}/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await res.json();
      setResendMsg(data.message || "Đã gửi lại email xác thực.");
    } catch {
      setResendMsg("Không thể kết nối tới máy chủ.");
    } finally {
      setResending(false);
    }
  };

  // Sau khi đăng ký thành công → hiển thị thông báo kiểm tra email
  if (registered) {
    return (
      <div className="steam-auth-wrapper">
        <div className="steam-auth-card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>📧</div>
          <h1 className="steam-auth-title" style={{ color: "#66c0f4" }}>
            Kiểm tra email của bạn
          </h1>
          <p style={{ color: "#c7d5e0", fontSize: "16px", lineHeight: 1.6 }}>
            Chúng tôi đã gửi email xác thực đến{" "}
            <strong style={{ color: "#66c0f4" }}>{registeredEmail}</strong>.
            <br />
            Vui lòng mở email và nhấn vào link xác thực để kích hoạt tài khoản.
          </p>
          <p style={{ color: "#8f98a0", fontSize: "13px", marginTop: "16px" }}>
            Không nhận được email? Kiểm tra thư mục Spam hoặc nhấn nút bên dưới
            để gửi lại.
          </p>
          <button
            className="steam-submit-btn"
            style={{ marginTop: "16px", background: "#32353c" }}
            disabled={resending}
            onClick={handleResend}
          >
            {resending ? "Đang gửi lại..." : "Gửi lại email xác thực"}
          </button>
          {resendMsg && (
            <p
              style={{
                color: "#a4d007",
                fontSize: "14px",
                marginTop: "12px",
              }}
            >
              {resendMsg}
            </p>
          )}
          <div className="steam-auth-footer" style={{ justifyContent: "center" }}>
            <span className="steam-link" onClick={() => onNavigate("login")}>
              Quay lại đăng nhập
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="steam-auth-wrapper">
      <div className="steam-auth-card">
        <h1 className="steam-auth-title">Tạo tài khoản của bạn</h1>

        {errorMsg && <div className="steam-error-msg">{errorMsg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="steam-form-group">
            <label className="steam-form-label highlight">
              Tên tài khoản Steam
            </label>
            <input
              type="text"
              className="steam-input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="Ví dụ: player_one"
              required
            />
          </div>

          <div className="steam-form-group">
            <label className="steam-form-label">Địa chỉ Email</label>
            <input
              type="email"
              className="steam-input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="name@example.com"
              required
            />
          </div>

          <div className="steam-form-group">
            <label className="steam-form-label">Mật khẩu</label>
            <input
              type="password"
              className="steam-input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Tối thiểu 6 ký tự"
              required
            />
          </div>

          <div className="steam-form-group">
            <label className="steam-form-label">Xác nhận mật khẩu</label>
            <input
              type="password"
              className="steam-input"
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
              placeholder="Nhập lại mật khẩu"
              required
            />
          </div>

          <button type="submit" className="steam-submit-btn" disabled={loading}>
            {loading ? "Đang khởi tạo..." : "Hoàn tất đăng ký"}
          </button>
        </form>

        <div className="steam-auth-footer">
          <span>Đã có tài khoản?</span>
          <span className="steam-link" onClick={() => onNavigate("login")}>
            Đăng nhập ngay
          </span>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
