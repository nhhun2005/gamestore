import { useState } from "react";
import { API_BASE_URL } from "../../utils/auth";
import "./Auth.css";

function LoginPage({ onAuthSuccess, onNavigate }) {
  const [form, setForm] = useState({ account: "", password: "" });
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || "Đăng nhập thất bại.");
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
        <h1 className="steam-auth-title">Đăng nhập</h1>

        {errorMsg && <div className="steam-error-msg">{errorMsg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="steam-form-group">
            <label className="steam-form-label highlight">
              Đăng nhập bằng tên tài khoản hoặc Email
            </label>
            <input
              type="text"
              className="steam-input"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
              placeholder="Nhập username hoặc email..."
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
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="steam-submit-btn" disabled={loading}>
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>

        <div className="steam-auth-footer">
          <span>Mới dùng Steam Store?</span>
          <span className="steam-link" onClick={() => onNavigate("register")}>
            Tạo một tài khoản miễn phí
          </span>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
