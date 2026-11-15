// Adapter for existing mocked commerce fixtures; this is not a database test.
export async function mockStore(page, snapshot, actor) {
  await page.route("**/api/store/games**", async (route) => {
    const state = typeof snapshot === "function" ? snapshot() : snapshot;
    const user = typeof actor === "function" ? actor(route) : actor || state.current_user;
    const url = new URL(route.request().url());
    const games = state.games || [];
    const id = url.pathname.slice("/api/store/games".length).replace(/^\//, "");
    const enrich = (game) => ({ ...game, developer_name: game.developer_name || state.users?.find((u) => u.id === game.developer_id)?.username });
    if (id) {
      const game = games.find((g) => g.id === decodeURIComponent(id));
      const owned = state.game_bought?.some((b) => b.user_id === user?.id && b.game_id === game?.id) || false;
      if (!game || (game.status !== "AVAILABLE" && !owned && game.developer_id !== user?.id && user?.role !== "ADMINISTRATOR")) return route.fulfill({ status: 404, json: { message: "Không tìm thấy trò chơi." } });
      return route.fulfill({ json: { game: enrich(game), promotions: state.promotions || [], owned, reviews: (state.reviews || []).filter((r) => r.game_id === game.id).map((r) => ({ ...r, username: state.users?.find((u) => u.id === r.user_id)?.username })) } });
    }
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const pageNumber = Number(url.searchParams.get("page") || 0), size = Number(url.searchParams.get("size") || 20);
    const filtered = games.filter((g) => g.status === "AVAILABLE" && g.title.toLowerCase().includes(q));
    return route.fulfill({ json: { items: filtered.slice(pageNumber * size, (pageNumber + 1) * size).map(enrich), promotions: state.promotions || [], total: filtered.length, page: pageNumber, size } });
  });
}
