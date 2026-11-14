import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../Login/Auth.css";

const API_BASE_URL = `${import.meta.env?.VITE_API_BASE_URL || "http://localhost:8080/api"}/auth`;

function VerifyEmailPage({ onNavigate }) {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading | success | expired | error
  const [message, setMessage] = useState("");
  const requestedRef = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Link xác thực không hợp lệ. Thiếu mã xác thực.");
      return;
    }

    if (requestedRef.current) return;
    requestedRef.current = true;

    const verify = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (res.ok) {
          setStatus("success");
          setMessage(data.message);
        } else if (res.status === 410) {
          setStatus("expired");
          setMessage(data.message);
        } else {
          setStatus("error");
          setMessage(data.message || "Xác thực thất bại.");
        }
      } catch {
        setStatus("error");
        setMessage("Không thể kết nối tới máy chủ.");
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="steam-auth-wrapper">
      <div className="steam-auth-card" style={{ textAlign: "center" }}>
        {status === "loading" && (
          <>
            <h1 className="steam-auth-title">Đang xác thực...</h1>
            <p style={{ color: "#8f98a0", fontSize: "16px" }}>
              Vui lòng chờ trong giây lát.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>✅</div>
            <h1 className="steam-auth-title" style={{ color: "#a4d007" }}>
              Xác thực thành công!
            </h1>
            <p style={{ color: "#c7d5e0", fontSize: "16px", lineHeight: 1.6 }}>
              {message}
            </p>
            <button
              className="steam-submit-btn"
              style={{ marginTop: "24px" }}
              onClick={() => onNavigate("login")}
            >
              Đăng nhập ngay
            </button>
          </>
        )}

        {status === "expired" && (
          <>
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>⏰</div>
            <h1 className="steam-auth-title" style={{ color: "#ffd866" }}>
              Link đã hết hạn
            </h1>
            <p style={{ color: "#c7d5e0", fontSize: "16px", lineHeight: 1.6 }}>
              {message}
            </p>
            <button
              className="steam-submit-btn"
              style={{ marginTop: "24px" }}
              onClick={() => onNavigate("login")}
            >
              Quay lại đăng nhập
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>❌</div>
            <h1 className="steam-auth-title" style={{ color: "#ff6b6b" }}>
              Xác thực thất bại
            </h1>
            <p style={{ color: "#c7d5e0", fontSize: "16px", lineHeight: 1.6 }}>
              {message}
            </p>
            <button
              className="steam-submit-btn"
              style={{ marginTop: "24px" }}
              onClick={() => onNavigate("login")}
            >
              Quay lại đăng nhập
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
