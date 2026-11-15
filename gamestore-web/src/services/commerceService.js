import { createSeed } from "../mocks/commerceSeed.js";
import { session } from "./session.js";
import { cents, decimal, dayOf, priceOf } from "./currency.js";
export const COMMERCE_KEY = "gamestore.commerce.v2";
function validState(state) {
  try {
    return (
      state?.version === 2 &&
      [
        "users",
        "games",
        "promotions",
        "transactions",
        "game_bought",
        "reviews",
      ].every((key) => Array.isArray(state[key])) &&
      (!state.wishlist || Array.isArray(state.wishlist)) &&
      (!state.library || ['collections', 'memberships', 'preferences'].every((key) => Array.isArray(state.library[key]))) &&
      state.users.every(
        (u) =>
          typeof u.id === "string" &&
          typeof u.username === "string" &&
          ["USER", "DEVELOPER", "ADMINISTRATOR"].includes(u.role) &&
          ["PENDING", "VERIFIED", "BANNED"].includes(u.status) &&
          cents(u.balance) >= 0n,
      ) &&
      state.promotions.every((p) => {
        if (
          !p.id ||
          !["ENABLED", "DISABLED"].includes(p.status) ||
          String(p.discount).length > 30
        )
          return false;
        priceOf({ price: "1.00", promotion_id: p.id }, [
          { ...p, status: "ENABLED" },
        ]);
        return true;
      }) &&
      state.games.every(
        (g) =>
          typeof g.id === "string" &&
          typeof g.title === "string" &&
          cents(g.price) >= 0n &&
          ["AVAILABLE", "HIDDEN"].includes(g.status) &&
          (g.rating === null ||
            (Number.isFinite(g.rating) && g.rating >= 1 && g.rating <= 5)) &&
          state.users.some((u) => u.id === g.developer_id) &&
          (!g.promotion_id ||
            state.promotions.some((p) => p.id === g.promotion_id)),
      ) &&
      state.transactions.every(
        (t) =>
          t.id &&
          t.user_id &&
          ["IN", "OUT", "BUY"].includes(t.type) &&
          ["PENDING", "SUCCESSED", "FAILED"].includes(t.status) &&
          cents(t.amount) >= 0n &&
          Number.isFinite(Date.parse(t.created_at)),
      ) &&
      state.game_bought.every(
        (p) =>
          state.games.some((g) => g.id === p.game_id) &&
          state.users.some((u) => u.id === p.user_id) &&
          state.transactions.some(
            (t) =>
              t.id === p.transaction_id &&
              t.user_id === p.user_id &&
              t.game_id === p.game_id &&
              t.type === "BUY" &&
              t.status === "SUCCESSED",
          ),
      ) &&
      state.reviews.every(
        (r) =>
          r.id &&
          typeof r.content === "string" &&
          typeof r.rating === "number" &&
          state.game_bought.some(
            (p) => p.user_id === r.user_id && p.game_id === r.game_id,
          ) &&
          r.rating >= 1 &&
          r.rating <= 5 &&
          Number.isInteger(r.rating * 2),
      )
    );
  } catch {
    return false;
  }
}
export function createCommerceService({
  storage,
  currentUser = () => null,
  enabled = true,
  delay = 150,
  now = () => Date.now(),
} = {}) {
  let state = createSeed();
  try {
    const saved = JSON.parse(storage?.getItem(COMMERCE_KEY));
    if (enabled && validState(saved)) {
      state = { ...saved, wishlist: saved.wishlist || [], library: saved.library || { collections: [], memberships: [], preferences: [] } };
    }
  } catch {
    /* Fresh state after incompatible or corrupt storage. */
  }
  let busy = false;
  const topUpChallenges = new Map();
  const listeners = new Set();
  const commit = (draft) => {
    try {
      storage?.setItem(COMMERCE_KEY, JSON.stringify(draft));
    } catch {
      throw Error(
        "Không thể lưu dữ liệu mô phỏng. Hãy kiểm tra quyền lưu trữ hoặc dung lượng trình duyệt.",
      );
    }
    state = draft;
    listeners.forEach((fn) => fn());
  };
  function actor() {
    const user = currentUser();
    if (!user) throw Error("Vui lòng đăng nhập để tiếp tục.");
    if (user.expiresAt && user.expiresAt <= Date.now())
      throw Error("Phiên đăng nhập đã hết hạn.");
    return user;
  }
  function collectionName(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw Error('Tên bộ sưu tập cần từ 1 đến 80 ký tự.');
    return name.trim();
  }
  function ownCollection(draft, user, id) {
    const row = draft.library.collections.find((c) => c.id === id && c.user_id === user.id);
    if (!row) throw Error('Không tìm thấy bộ sưu tập của bạn.');
    return row;
  }
  function ownGame(draft, user, gameId) {
    if (!draft.game_bought.some((p) => p.user_id === user.id && p.game_id === gameId)) throw Error('Chỉ được quản lý trò chơi đã sở hữu trong thư viện của bạn.');
  }
  function uniqueCollection(draft, user, name, id) {
    if (draft.library.collections.some((c) => c.user_id === user.id && c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw Error('Tên bộ sưu tập đã tồn tại.');
  }
  async function mutate(operation) {
    if (!enabled)
      throw Error(
        "API thương mại chưa được tích hợp. Mô phỏng chỉ khả dụng trên dev server.",
      );
    const user = actor();
    if (busy) throw Error("Yêu cầu trước đang được xử lý.");
    busy = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (actor().id !== user.id)
        throw Error("Phiên đăng nhập đã thay đổi. Vui lòng thử lại.");
      const draft = structuredClone(state);
      const account = draft.users.find((u) => u.id === user.id);
      if (!account)
        throw Error("Chưa tải dữ liệu tài khoản. Vui lòng thử lại.");
      if (account.status !== "VERIFIED")
        throw Error("Tài khoản chưa được xác minh hoặc đã bị khóa.");
      const result = operation(draft, user, account);
      commit(draft);
      return result;
    } finally {
      busy = false;
    }
  }
  const transaction = (draft, user, type, amount, game = null) => {
    const row = {
      id: crypto.randomUUID(),
      user_id: user.id,
      game_id: game?.id ?? null,
      type,
      amount,
      status: "SUCCESSED",
      created_at: new Date().toISOString(),
    };
    draft.transactions.unshift(row);
    return row;
  };
  return {
    snapshot: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async prepareAccount() {
      if (!enabled) return;
      const user = actor();
      const existing = state.users.find((u) => u.id === user.id);
      if (
        existing &&
        existing.username === user.username &&
        existing.role === user.role
      )
        return;
      const draft = structuredClone(state);
      const account = draft.users.find((u) => u.id === user.id);
      if (account)
        Object.assign(account, { username: user.username, role: user.role });
      else
        draft.users.push({
          id: user.id,
          username: user.username,
          role: user.role,
          status: "VERIFIED",
          balance: "100000.00",
        });
      commit(draft);
    },
    async createTopUpChallenge(amount) {
      if (!enabled) throw Error("API thương mại chưa được tích hợp. Mô phỏng chỉ khả dụng trên dev server.");
      const user = actor();
      const account = state.users.find((u) => u.id === user.id);
      if (!account || account.status !== "VERIFIED") throw Error("Tài khoản chưa được xác minh hoặc đã bị khóa.");
      const value = cents(amount);
      if (value <= 0n || value > 10000000000n) throw Error("Số tiền nạp phải lớn hơn 0 và không quá 100.000.000 ₫.");
      for (const [id, entry] of topUpChallenges) if (Date.parse(entry.expires_at) <= now()) topUpChallenges.delete(id);
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const letters = Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => alphabet[n % alphabet.length]).join("");
      const challenge = { challenge_id: crypto.randomUUID(), amount: decimal(value), code: `GS-${letters.slice(0, 4)}-${letters.slice(4)}`, expires_at: new Date(now() + 600000).toISOString() };
      topUpChallenges.set(user.id, { ...challenge, attempts: 0 });
      return { ...challenge };
    },
    async topUp(amount, key, proof = {}) {
      return mutate((draft, user, account) => {
        const value = cents(amount);
        if (value <= 0n || value > 10000000000n)
          throw Error("Số tiền nạp phải lớn hơn 0 và không quá 100.000.000 ₫.");
        if (!key || key !== proof.challenge_id || typeof proof.code !== "string" || !proof.code.trim() || proof.code.length > 32)
          throw Error("Cần mã xác nhận và đúng yêu cầu QR để nạp tiền.");
        const previous = draft.transactions.find((t) => t.user_id === user.id && t.idempotency_key === key);
        if (previous) {
          if (previous.type !== "IN" || cents(previous.amount) !== value) throw Error("Mã yêu cầu đã dùng cho một giao dịch khác.");
          return previous;
        }
        const challenge = topUpChallenges.get(user.id);
        if (!challenge || challenge.challenge_id !== key) throw Error("Mã QR không còn hiệu lực. Vui lòng tạo QR mới.");
        if (Date.parse(challenge.expires_at) <= now()) {
          topUpChallenges.delete(user.id);
          throw Error("Mã QR đã hết hạn. Vui lòng tạo QR mới.");
        }
        if (cents(challenge.amount) !== value) throw Error("Số tiền không khớp với mã QR. Vui lòng tạo QR mới.");
        const normalize = (code) => code.trim().replace(/[- ]/g, "").toUpperCase();
        if (normalize(proof.code) !== normalize(challenge.code)) {
          if (++challenge.attempts >= 5) {
            topUpChallenges.delete(user.id);
            throw Error("Đã nhập sai mã 5 lần. Vui lòng tạo QR mới.");
          }
          throw Error("Mã xác nhận không đúng. Vui lòng quét QR và nhập lại.");
        }
        if (cents(account.balance) + value > 99999999999999n)
          throw Error("Số dư vượt giới hạn mô phỏng.");
        account.balance = decimal(cents(account.balance) + value);
        const result = transaction(draft, user, "IN", decimal(value));
        result.idempotency_key = key;
        return result;
      });
    },
    async purchase(gameId) {
      return mutate((draft, user, account) => {
        const game = draft.games.find((g) => g.id === gameId);
        if (!game) throw Error("Trò chơi không tồn tại.");
        if (game.status !== "AVAILABLE")
          throw Error("Trò chơi hiện chưa mở bán.");
        if (
          draft.game_bought.some(
            (p) => p.user_id === user.id && p.game_id === gameId,
          )
        )
          throw Error("Bạn đã sở hữu trò chơi này.");
        const amount = priceOf(game, draft.promotions).final;
        if (cents(account.balance) < cents(amount))
          throw Error("Số dư không đủ. Vui lòng nạp thêm tiền.");
        account.balance = decimal(cents(account.balance) - cents(amount));
        const row = transaction(draft, user, "BUY", amount, game);
        // Simulates the V2 database trigger; real API clients must not insert ownership separately.
        draft.game_bought.push({
          user_id: user.id,
          game_id: gameId,
          transaction_id: row.id,
        });
        return row;
      });
    },
    async saveReview(gameId, rating, content) {
      return mutate((draft, user) => {
        if (
          !draft.game_bought.some(
            (p) => p.user_id === user.id && p.game_id === gameId,
          )
        )
          throw Error("Chỉ người sở hữu trò chơi mới được đánh giá.");
        if (
          !Number.isFinite(rating) ||
          rating < 1 ||
          rating > 5 ||
          !Number.isInteger(rating * 2)
        )
          throw Error("Điểm đánh giá phải từ 1 đến 5, theo bước 0,5.");
        if (
          typeof content !== "string" ||
          !content.trim() ||
          content.trim().length > 2000
        )
          throw Error("Nội dung cần từ 1 đến 2.000 ký tự.");
        const existing = draft.reviews.find(
          (r) => r.game_id === gameId && r.user_id === user.id,
        );
        if (existing)
          Object.assign(existing, { rating, content: content.trim() });
        else
          draft.reviews.push({
            id: crypto.randomUUID(),
            user_id: user.id,
            game_id: gameId,
            rating,
            content: content.trim(),
          });
        updateRating(draft, gameId);
      });
    },
    async deleteReview(reviewId) {
      return mutate((draft, user) => {
        const row = draft.reviews.find(
          (r) => r.id === reviewId && r.user_id === user.id,
        );
        if (!row) throw Error("Không tìm thấy đánh giá của bạn.");
        draft.reviews = draft.reviews.filter((r) => r.id !== reviewId);
        updateRating(draft, row.game_id);
      });
    },
    async createCollection(name) {
      return mutate((draft, user) => {
        const value = collectionName(name);
        uniqueCollection(draft, user, value);
        const row = { id: crypto.randomUUID(), user_id: user.id, name: value };
        draft.library.collections.push(row);
        return row;
      });
    },
    async renameCollection(id, name) {
      return mutate((draft, user) => {
        const row = ownCollection(draft, user, id);
        const value = collectionName(name);
        uniqueCollection(draft, user, value, id);
        row.name = value;
        return row;
      });
    },
    async deleteCollection(id) {
      return mutate((draft, user) => {
        ownCollection(draft, user, id);
        draft.library.collections = draft.library.collections.filter((c) => c.id !== id);
        draft.library.memberships = draft.library.memberships.filter((m) => m.collection_id !== id);
      });
    },
    async collectionGame(collectionId, gameId, add) {
      return mutate((draft, user) => {
        ownCollection(draft, user, collectionId);
        ownGame(draft, user, gameId);
        const matches = (m) => m.collection_id === collectionId && m.game_id === gameId;
        if (add && !draft.library.memberships.some(matches)) draft.library.memberships.push({ collection_id: collectionId, game_id: gameId, user_id: user.id });
        if (!add) draft.library.memberships = draft.library.memberships.filter((m) => !matches(m));
      });
    },
    async saveLibraryPreference(gameId, note, hidden) {
      return mutate((draft, user) => {
        ownGame(draft, user, gameId);
        if (typeof note !== 'string' || note.length > 2000 || typeof hidden !== 'boolean') throw Error('Ghi chú tối đa 2.000 ký tự và cần trạng thái ẩn/hiện hợp lệ.');
        const previous = draft.library.preferences.find((p) => p.user_id === user.id && p.game_id === gameId);
        const value = { user_id: user.id, game_id: gameId, note: note.trim(), hidden };
        if (previous) Object.assign(previous, value);
        else draft.library.preferences.push(value);
      });
    },
    async addWishlist(gameId) {
      return mutate((draft, user) => {
        if (!draft.wishlist) draft.wishlist = [];
        if (!draft.wishlist.some((w) => w.game_id === gameId && w.user_id === user.id)) {
          draft.wishlist.unshift({
            user_id: user.id,
            game_id: gameId,
            created_at: new Date().toISOString(),
          });
        }
      });
    },
    async removeWishlist(gameId) {
      return mutate((draft, user) => {
        draft.wishlist = (draft.wishlist || []).filter((w) => w.game_id !== gameId || (w.user_id && w.user_id !== user.id));
      });
    },
    async notifications() {
      return { items: [], unread_count: 0 };
    },
    async markNotificationRead() {},
    async markAllNotificationsRead() {},
    async revenue({ from = "", to = "" } = {}) {
      if (!enabled) throw Error("API doanh thu chưa được tích hợp.");
      const user = actor();
      if (!["DEVELOPER", "ADMINISTRATOR"].includes(user.role))
        throw Error("Bạn không có quyền xem doanh thu.");
      if (from && to && from > to)
        throw Error("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.");
      return state.transactions
        .filter(
          (t) =>
            t.type === "BUY" &&
            t.status === "SUCCESSED" &&
            (user.role === "ADMINISTRATOR" ||
              state.games.find((g) => g.id === t.game_id)?.developer_id ===
                user.id) &&
            (!from || dayOf(t.created_at) >= from) &&
            (!to || dayOf(t.created_at) <= to),
        )
        .map((t) => {
          const game = state.games.find((g) => g.id === t.game_id);
          const owner = state.users.find((u) => u.id === game.developer_id);
          const platformOwned = owner?.role === 'ADMINISTRATOR';
          const fee = platformOwned ? cents(t.amount) : (cents(t.amount) + 5n) / 10n;
          return { ...t, game_title: game.title, developer_id: game.developer_id,
            developer_name: owner?.username,
            beneficiary_type: platformOwned ? 'PLATFORM' : 'DEVELOPER',
            platform_fee: decimal(fee), developer_revenue: decimal(cents(t.amount) - fee) };
        });
    },
    async publicationFees() {
      if (!["DEVELOPER", "ADMINISTRATOR"].includes(actor().role)) throw Error("Bạn không có quyền xem doanh thu.");
      return [];
    },
    async reset() {
      const result = await mutate((draft) => {
        const fresh = createSeed();
        for (const user of draft.users)
          if (!fresh.users.some((u) => u.id === user.id))
            fresh.users.push({ ...user, balance: "100000.00" });
        Object.assign(draft, fresh);
      });
      topUpChallenges.clear();
      return result;
    },
  };
}
function updateRating(draft, gameId) {
  const reviews = draft.reviews.filter((r) => r.game_id === gameId);
  draft.games.find((g) => g.id === gameId).rating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;
}
let storage;
try {
  storage = typeof localStorage === "undefined" ? undefined : localStorage;
} catch {
  /* In-memory preview if access is denied. */
}
export const commerceService = createCommerceService({
  storage,
  currentUser: session.snapshot,
  enabled: Boolean(import.meta.env?.DEV),
});
