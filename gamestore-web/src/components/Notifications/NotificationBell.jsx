import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCommerce } from "../commerce/context";
import "./NotificationBell.css";

export default function NotificationBell() {
  const { user, service } = useCommerce();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    if (!user || user.source !== "jwt" || !service?.notifications) return;
    try {
      setError("");
      const data = await service.notifications();
      if (data) {
        setItems(data.items || []);
        setUnreadCount(
          data.unread_count ??
            (data.items || []).filter((i) => !i.is_read && !i.read_at).length,
        );
      }
    } catch (err) {
      setError(err.message || "Không thể tải thông báo.");
    }
  }, [user, service]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleToggle() {
    if (!open) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
    setOpen((prev) => !prev);
  }

  async function handleMarkAllRead() {
    if (busy || unreadCount === 0 || !service?.markAllNotificationsRead) return;
    setBusy(true);
    try {
      await service.markAllNotificationsRead();
      setUnreadCount(0);
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          is_read: true,
          read_at: new Date().toISOString(),
        })),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleItemClick(item) {
    if (!item.is_read && !item.read_at && service?.markNotificationRead) {
      try {
        await service.markNotificationRead(item.id);
        setUnreadCount((prev) => Math.max(0, prev - 1));
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, is_read: true, read_at: new Date().toISOString() }
              : i,
          ),
        );
      } catch {
        // Tiếp tục chuyển trang kể cả khi đánh dấu đã đọc gặp lỗi
      }
    }
    setOpen(false);
    navigate("/wishlist");
  }

  return (
    <div className="notif-root" ref={panelRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label="Thông báo"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span className="notif-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="region" aria-label="Bảng thông báo">
          <div className="notif-head">
            <strong>Thông báo</strong>
            <button
              type="button"
              className="notif-link"
              disabled={busy || unreadCount === 0}
              onClick={handleMarkAllRead}
            >
              Đánh dấu tất cả đã đọc
            </button>
          </div>

          {error && <p className="notif-error">{error}</p>}

          {loading ? (
            <p className="notif-empty">Đang tải thông báo…</p>
          ) : items.length === 0 ? (
            <p className="notif-empty">Chưa có thông báo nào.</p>
          ) : (
            <ul className="notif-list">
              {items.map((item) => {
                const unread = !item.is_read && !item.read_at;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`notif-item ${unread ? "unread" : ""}`}
                      onClick={() => handleItemClick(item)}
                    >
                      <strong>
                        {item.discount && (
                          <span className="notif-badge">
                            −{item.discount}%
                          </span>
                        )}
                        {item.title}
                      </strong>
                      <span>{item.message}</span>
                      {item.created_at && (
                        <small>
                          {new Date(item.created_at).toLocaleString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh",
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </small>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
