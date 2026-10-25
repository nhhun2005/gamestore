import { useState } from "react";
import { useCommerce } from "../../components/commerce/context";
import {
  PageHeader,
  TransactionTable,
} from "../../components/commerce/CommerceUI";
import { cents } from "../../services/currency";
export default function TransactionsPage() {
  const { state, user } = useCommerce();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const rows = state.transactions
    .filter(
      (t) =>
        t.user_id === user.id &&
        (!type || t.type === type) &&
        (!status || t.status === status),
    )
    .sort((a, b) =>
      sort === "amount"
        ? cents(a.amount) === cents(b.amount)
          ? 0
          : cents(a.amount) > cents(b.amount)
            ? -1
            : 1
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(page, pages);
  return (
    <main className="steam-main-content commerce-page">
      <PageHeader eyebrow="TÀI KHOẢN / GIAO DỊCH" title="Lịch sử giao dịch">
        Tiền nạp và các trò chơi bạn đã mua, trong một dòng lịch sử.
      </PageHeader>
      <div className="commerce-filters">
        <label>
          Loại giao dịch
          <select
            className="commerce-input"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả loại</option>
            {["IN", "OUT", "BUY"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select
            className="commerce-input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            {["PENDING", "SUCCESSED", "FAILED"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Sắp xếp
          <select
            className="commerce-input"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
            <option value="amount">Số tiền giảm dần</option>
          </select>
        </label>
      </div>
      <TransactionTable
        transactions={rows.slice((current - 1) * 8, current * 8)}
        games={state.games}
      />
      <div className="commerce-pagination">
        <button
          className="commerce-button"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          ← Trước
        </button>
        <span>
          Trang {current} / {pages} · {rows.length} giao dịch
        </span>
        <button
          className="commerce-button"
          disabled={current === pages}
          onClick={() => setPage(current + 1)}
        >
          Sau →
        </button>
      </div>
    </main>
  );
}
