import { useState } from "react";
import { API_BASE_URL } from "../../utils/auth";
import "../Login/Auth.css";

function RegisterPage({ onAuthSuccess, onNavigate }) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

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
        onAuthSuccess(data);
      }
    } catch {
      setErrorMsg(
        "Không thể kết nối tới máy chủ Backend (http://localhost:8080).",
      );
    } finally {
      setLoading(false);
    }
  };

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
