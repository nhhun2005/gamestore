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
  const admin = user.role === "ADMINISTRATOR";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([user.id, from, to, retry]);
  const [result, setResult] = useState({
    key: "",
    rows: [],
    fees: [],
    error: "",
  });
  useEffect(() => {
    let active = true;
    Promise.all([
      service.revenue({ from, to }),
      service.publicationFees({ from, to }),
    ])
      .then(([rows, fees]) => {
        if (active) setResult({ key, rows, fees, error: "" });
      })
      .catch((e) => {
        if (active) setResult({ key, rows: [], fees: [], error: e.message });
      });
    return () => {
      active = false;
    };
  }, [service, state, user.id, from, to, key]);
  const totals = result.rows.reduce(
    (a, r) => ({
      gross: a.gross + cents(r.amount),
      platform: a.platform + cents(r.platform_fee),
      net: a.net + cents(r.developer_revenue),
    }),
    { gross: 0n, platform: 0n, net: 0n },
  );
  const fees = result.fees.reduce((sum, r) => sum + cents(r.amount), 0n);
  const metric = (label, amount) => (
    <section className="commerce-panel">
      <small>{label}</small>
      <h2>{money(decimal(amount))}</h2>
    </section>
  );
  function breakdown(developers) {
    const groups = new Map();
    for (const row of result.rows) {
      const id = developers ? row.developer_id : row.game_id;
      if (!groups.has(id))
        groups.set(id, {
          id,
          name: developers ? row.developer_name : row.game_title,
          count: 0,
          gross: 0n,
          platform: 0n,
          net: 0n,
        });
      const group = groups.get(id);
      group.count++;
      group.gross += cents(row.amount);
      group.platform += cents(row.platform_fee);
      group.net += cents(row.developer_revenue);
    }
    return [...groups.values()].sort((a, b) =>
      a.gross > b.gross ? -1 : a.gross < b.gross ? 1 : 0,
    );
  }
  const table = (developers = false) => (
    <section className="commerce-panel">
      <h2>
        {developers
          ? "Doanh thu theo chủ game"
          : "Hiệu quả & trò chơi bán chạy"}
      </h2>
      <div className="commerce-table-scroll">
        <table className="steam-table commerce-table">
          <thead>
            <tr>
              <th>{developers ? "Chủ game" : "Trò chơi"}</th>
              <th>Lượt mua</th>
              <th>Doanh thu gộp</th>
              <th>{admin ? "Hệ thống nhận" : "Phí sàn"}</th>
              <th>Developer nhận</th>
            </tr>
          </thead>
          <tbody>
            {breakdown(developers).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.count}</td>
                <td>{money(decimal(r.gross))}</td>
                <td>{money(decimal(r.platform))}</td>
                <td>{money(decimal(r.net))}</td>
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
          admin ? "TOÀN HỆ THỐNG / PHÂN TÍCH" : `${user.username} / PHÂN TÍCH`
        }
        title="Doanh thu trò chơi"
      />
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
      {result.key !== key ? (
        <p role="status">Đang tải doanh thu…</p>
      ) : result.error ? (
        <div role="alert" className="commerce-error">
          {result.error}{" "}
          <button
            className="commerce-button"
            onClick={() => setRetry(retry + 1)}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <div className="revenue-metrics">
            {metric("DOANH THU GỘP", totals.gross)}
            {metric(
              admin ? "HỆ THỐNG NHẬN TỪ BÁN GAME" : "PHẦN HỆ THỐNG NHẬN",
              totals.platform,
            )}
            {metric(
              admin ? "TỔNG CHIA CHO DEVELOPER" : "DOANH THU CỦA BẠN",
              totals.net,
            )}
            {metric(
              admin ? "PHÍ ĐĂNG GAME ĐÃ THU" : "PHÍ ĐĂNG GAME ĐÃ THANH TOÁN",
              fees,
            )}
            {admin &&
              metric(
                "DOANH THU NỀN TẢNG · BÁN GAME + PHÍ ĐĂNG",
                totals.platform + fees,
              )}
            <section className="commerce-panel">
              <small>LƯỢT MUA THÀNH CÔNG</small>
              <h2>{result.rows.length}</h2>
            </section>
          </div>

          {result.rows.length ? (
            <>
              <section className="commerce-panel">
                <h2>Xu hướng doanh thu {admin ? "hệ thống" : "developer"}</h2>
                <RevenueChart
                  rows={result.rows.map((r) => ({
                    ...r,
                    amount: admin ? r.platform_fee : r.developer_revenue,
                  }))}
                />
              </section>
              {table()}
              {admin && table(true)}
            </>
          ) : (
            <EmptyState title="Chưa có lượt mua trong khoảng thời gian này" />
          )}
          {!!result.fees.length && (
            <section className="commerce-panel">
              <h2>Phí đăng game miễn phí</h2>
              <div className="commerce-table-scroll">
                <table className="steam-table commerce-table">
                  <thead>
                    <tr>
                      <th>Trò chơi</th>
                      {admin && <th>Developer</th>}
                      <th>Ngày thanh toán</th>
                      <th>Phí đăng tải</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.fees.map((r) => (
                      <tr key={r.game_id}>
                        <td>{r.game_title}</td>
                        {admin && <td>{r.developer_name}</td>}
                        <td>
                          {new Date(r.created_at).toLocaleDateString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh",
                          })}
                        </td>
                        <td>{money(r.amount)} (50 USD)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
