import { useEffect, useState } from "react";
import "./ManageUsersPage.css";

const API_BASE_URL = "http://localhost:8080/api/admin/users";
const TOKEN_KEY = "steam_jwt_token";

const ROLES = ["USER", "DEVELOPER", "ADMINISTRATOR"];
const STATUSES = ["PENDING", "VERIFIED", "BANNED"];

function ManageUsersPage({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
  });

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_BASE_URL, { headers: authHeaders() });
      if (!res.ok) {
        throw new Error("Không thể tải danh sách người dùng từ máy chủ.");
      }
      setUsers(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Dùng chung cho cả đổi vai trò (field = "role") và đổi trạng thái (field = "status")
  const updateUserField = async (targetUserId, field, value, failMessage) => {
    setUpdatingId(targetUserId);
    try {
      const res = await fetch(`${API_BASE_URL}/${targetUserId}/${field}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.message || failMessage);
        return;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === targetUserId ? { ...u, [field]: data[field] } : u,
        ),
      );
    } catch {
      alert("Lỗi kết nối tới máy chủ.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRoleChange = (id, role) =>
    updateUserField(id, "role", role, "Cập nhật vai trò thất bại.");

  const handleStatusChange = (id, status) =>
    updateUserField(id, "status", status, "Cập nhật trạng thái thất bại.");

  return (
    <main className="steam-main-content">
      <div className="section-banner">
        <h2>Quản lý Người dùng (Admin Control Panel)</h2>
        <p>
          Kiểm tra danh sách tài khoản, phân quyền và quản lý trạng thái hoạt
          động.
        </p>
      </div>

      {error && <div className="mu-error">{error}</div>}

      {loading ? (
        <p className="mu-state">Đang tải danh sách người dùng...</p>
      ) : (
        <div className="mu-table-wrap">
          <table className="mu-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Vai trò (Role)</th>
                <th>Trạng thái (Status)</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => {
                const isCurrentUser =
                  item.id === user?.id || item.username === user?.username;
                const isUpdating = updatingId === item.id;

                return (
                  <tr
                    key={item.id}
                    className={isCurrentUser ? "is-current" : ""}
                  >
                    <td>
                      <span className="mu-username">{item.username}</span>
                      {isCurrentUser && <span className="mu-you">(Bạn)</span>}
                    </td>
                    <td className="mu-email">{item.email}</td>
                    <td>
                      {isCurrentUser ? (
                        <span className={`role-tag ${item.role}`}>
                          {item.role}
                        </span>
                      ) : (
                        <select
                          className={`mu-select ${item.role}`}
                          value={item.role}
                          disabled={isUpdating}
                          onChange={(e) =>
                            handleRoleChange(item.id, e.target.value)
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {isCurrentUser ? (
                        <span className={`mu-status-tag ${item.status}`}>
                          {item.status}
                        </span>
                      ) : (
                        <select
                          className={`mu-select ${item.status}`}
                          value={item.status}
                          disabled={isUpdating}
                          onChange={(e) =>
                            handleStatusChange(item.id, e.target.value)
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default ManageUsersPage;
