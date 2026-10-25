import { useEffect, useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import {
  EmptyState,
  PageHeader,
  RevenueChart,
} from "../../components/commerce/CommerceUI";
import { cents, decimal, money } from "../../services/currency";
export default function RevenuePage() {
  const { service, state, user } = useCommerce();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState({ rows: [], loading: true, error: "" });
  useEffect(() => {
    let active = true;
    service
      .revenue({ from, to })
      .then((rows) => {
        if (active) setResult({ rows, loading: false, error: "" });
      })
      .catch((error) => {
        if (active)
          setResult({ rows: [], loading: false, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [service, state, user.id, from, to]);
  const total = result.rows.reduce((sum, row) => sum + cents(row.amount), 0n);
  function breakdown(developers = false) {
    const groups = {};
    for (const transaction of result.rows) {
      const game = state.games.find((g) => g.id === transaction.game_id);
      const id = developers ? game.developer_id : game.id;
      groups[id] ||= {
        id,
        name: developers
          ? state.users.find((u) => u.id === id)?.username || id
          : game.title,
        amount: 0n,
        count: 0,
      };
      groups[id].amount += cents(transaction.amount);
      groups[id].count++;
    }
    return Object.values(groups).sort(
      (a, b) =>
        (!developers ? b.count - a.count : 0) ||
        (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0),
    );
  }
  const table = (developer = false) => (
    <section className="commerce-panel">
      <h2>
        {developer
          ? "Doanh thu theo Developer"
          : "Hiệu quả & trò chơi bán chạy"}
      </h2>
      <div className="commerce-table-scroll">
        <table className="steam-table commerce-table">
          <thead>
            <tr>
              <th>{developer ? "Developer" : "Trò chơi"}</th>
              <th>Lượt mua</th>
              <th>Doanh thu gộp</th>
            </tr>
          </thead>
          <tbody>
            {breakdown(developer).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.count}</td>
                <td>{money(decimal(row.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <main className="steam-main-content commerce-page">
      <PageHeader
        eyebrow={
          user.role === "ADMINISTRATOR"
            ? "TOÀN HỆ THỐNG / PHÂN TÍCH"
            : `${user.username} / PHÂN TÍCH`
        }
        title="Doanh thu trò chơi"
      >
        Doanh thu gộp từ BUY thành công; không bao gồm tiền nạp ví.
      </PageHeader>
      <div className="commerce-filters">
        <label>
          Từ ngày
          <input
            className="commerce-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            className="commerce-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          className="commerce-button"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
        >
          Toàn bộ thời gian
        </button>
      </div>
      {result.loading ? (
        <p role="status">Đang tải doanh thu…</p>
      ) : result.error ? (
        <p role="alert" className="commerce-error">
          {result.error}
        </p>
      ) : (
        <>
          <div className="revenue-metrics">
            <section className="commerce-panel">
              <small>DOANH THU GỘP</small>
              <h2>{money(decimal(total))}</h2>
            </section>
            <section className="commerce-panel">
              <small>LƯỢT MUA THÀNH CÔNG</small>
              <h2>{result.rows.length}</h2>
            </section>
            <section className="commerce-panel">
              <small>TRÒ CHƠI CÓ LƯỢT MUA</small>
              <h2>{new Set(result.rows.map((t) => t.game_id)).size}</h2>
            </section>
          </div>
          {result.rows.length ? (
            <>
              <section className="commerce-panel">
                <h2>Xu hướng doanh thu</h2>
                <RevenueChart rows={result.rows} />
                <p className="commerce-note">
                  Ngày được nhóm theo múi giờ Việt Nam (UTC+7).
                </p>
              </section>
              {table()}
              {user.role === "ADMINISTRATOR" && table(true)}
            </>
          ) : (
            <EmptyState title="Chưa có lượt mua trong khoảng thời gian này" />
          )}
        </>
      )}
    </main>
  );
}
