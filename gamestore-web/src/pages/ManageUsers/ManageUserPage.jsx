function ManageUsersPage({ user }) {
  return (
    <main className="steam-main-content">
      <div className="section-banner">
        <h2>Quản lý Người dùng (Admin Control Panel)</h2>
        <p>
          Kiểm tra danh sách tài khoản, phân quyền và duyệt game_submissions.
        </p>
      </div>

      <table className="steam-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Vai trò (Role)</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{user?.username}</td>
            <td>{user?.email}</td>
            <td>
              <span className="role-tag ADMIN">ADMIN</span>
            </td>
            <td>Đang hoạt động</td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}

export default ManageUsersPage;
