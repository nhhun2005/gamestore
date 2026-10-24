function DevManageGamesPage() {
  return (
    <main className="steam-main-content">
      <div className="section-banner">
        <h2>Quản lý Game (Developer Dashboard)</h2>
        <p>Gửi bản dựng game mới (game_submissions) và cập nhật giá bán.</p>
      </div>

      <table className="steam-table">
        <thead>
          <tr>
            <th>Tên Game</th>
            <th>Giá bán</th>
            <th>Trạng thái hiển thị</th>
            <th>Trạng thái duyệt</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Test Game Project</td>
            <td>100.000₫</td>
            <td>HIDDEN</td>
            <td>PENDING</td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}

export default DevManageGamesPage;
