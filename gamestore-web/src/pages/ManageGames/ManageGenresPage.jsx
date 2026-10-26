import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CommerceContext } from "../../components/commerce/context";
import { Modal } from "../../components/commerce/CommerceUI";
import { genreApi } from "../../services/genreApi";

export default function ManageGenresPage() {
  const { user, service } = useContext(CommerceContext);
  const [genres, setGenres] = useState([]);
  const [games, setGames] = useState([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [gameSearch, setGameSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [formError, setFormError] = useState("");
  const active = useRef(true);
  const load = useCallback(async () => {
    const [nextGenres, nextGames] = await Promise.all([genreApi.list(), genreApi.games()]);
    if (!active.current) return;
    setGenres(nextGenres);
    setGames(nextGames);
    setSelected(current => nextGenres.some(g => g.id === current) ? current : nextGenres[0]?.id || "");
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { await load(); }
    catch (e) { if (active.current) setError(e.message); }
    finally { if (active.current) setLoading(false); }
  }, [load]);
  useEffect(() => {
    active.current = true;
    if (user.source === "jwt") {
      load().catch(e => { if (active.current) setError(e.message); })
        .finally(() => { if (active.current) setLoading(false); });
    }
    return () => { active.current = false; };
  }, [load, user.source]);
  async function mutate(action, success, close) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFormError(""); setError(""); setNotice("");
    try {
      await action();
      if (!active.current) return;
      close?.(); setNotice(success);
      try { await load(); await service.prepareAccount(); }
      catch (e) { if (active.current) setError(`Đã lưu thay đổi, nhưng chưa tải lại được dữ liệu: ${e.message}`); }
    } catch (e) {
      if (active.current) {
        if (editor || deleting) setFormError(e.message);
        else setError(e.message);
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  if (user.source !== "jwt") return <section className="commerce-panel"><h2>Quản lý thể loại trò chơi</h2><p role="status">Vui lòng đăng nhập tài khoản quản trị thật để sử dụng chức năng này. Chế độ Demo chưa hỗ trợ quản lý thể loại.</p></section>;
  const current = genres.find(g => g.id === selected);
  const filtered = genres.filter(g => g.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));
  return <>
    <div className="genre-heading"><h2>Quản lý thể loại trò chơi</h2><button className="commerce-button" disabled={busy || loading} onClick={() => { setFormError(""); setEditor({ name: "", description: "" }); }}>Thêm thể loại</button></div>
    {notice && <p className="commerce-notice" role="status">{notice}</p>}
    {error && <div className="commerce-error" role="alert">{error} <button className="commerce-button" disabled={busy || loading} onClick={refresh}>Tải lại dữ liệu</button></div>}
    {loading ? <p role="status">Đang tải thể loại…</p> : <div className="genre-columns" aria-busy={busy}>
      <section className="commerce-panel">
        <h3>Danh sách thể loại ({genres.length})</h3>
        <label className="genre-field">Tìm thể loại<input value={search} onChange={e => setSearch(e.target.value)} type="search" /></label>
        {!filtered.length && <p>{genres.length ? "Không có thể loại phù hợp." : "Chưa có thể loại nào. Hãy thêm thể loại đầu tiên."}</p>}
        <ul className="genre-list">{filtered.map(g => <li key={g.id} className={g.id === selected ? "selected" : ""}>
          <button className="genre-select" aria-pressed={g.id === selected} onClick={() => setSelected(g.id)}><strong>{g.name}</strong><span>{g.game_count} trò chơi</span></button>
          {g.description && <p>{g.description}</p>}
          <div className="genre-actions"><button className="commerce-button secondary" disabled={busy} aria-label={`Sửa ${g.name}`} onClick={() => { setFormError(""); setEditor({ ...g, description: g.description || "" }); }}>Sửa</button>
            <button className="commerce-button danger" disabled={busy} aria-label={`Xóa ${g.name}`} onClick={() => { setFormError(""); setDeleting(g); }}>Xóa</button></div>
        </li>)}</ul>
      </section>
      <section className="commerce-panel">
        <h3>{current ? `Gán thể loại: ${current.name}` : "Gán thể loại cho trò chơi"}</h3>
        <p>Một trò chơi có thể có nhiều thể loại. Thao tác ở đây chỉ thay đổi thể loại đang chọn.</p>
        {current ? <>
          <label className="genre-field">Tìm trò chơi<input type="search" value={gameSearch} onChange={e => setGameSearch(e.target.value)} /></label>
          {!games.length && <p>Chưa có trò chơi nào để gán thể loại.</p>}
          {games.length > 0 && !games.some(g => g.title.toLocaleLowerCase("vi").includes(gameSearch.toLocaleLowerCase("vi"))) && <p>Không có trò chơi phù hợp.</p>}
          <ul className="genre-list">{games.filter(g => g.title.toLocaleLowerCase("vi").includes(gameSearch.toLocaleLowerCase("vi"))).map(game => {
            const assigned = game.genre_ids.includes(selected);
            return <li key={game.id}><strong>{game.title}</strong><small>{game.status === "HIDDEN" ? "Đang ẩn" : "Đang phát hành"} · {game.genre_ids.length} thể loại</small>
              <p>{game.genre_ids.map(id => genres.find(g => g.id === id)?.name).filter(Boolean).join(", ") || "Chưa gán thể loại"}</p>
              <button className={`commerce-button ${assigned ? "secondary" : ""}`} disabled={busy} aria-label={`${assigned ? "Gỡ khỏi" : "Gán cho"} ${game.title}`} onClick={() => mutate(() => genreApi.link(selected, game.id, !assigned), assigned ? "Đã gỡ thể loại khỏi trò chơi." : "Đã gán thể loại cho trò chơi.")}>{assigned ? "Gỡ thể loại" : "Gán thể loại"}</button>
            </li>;
          })}</ul>
        </> : <p>Chọn hoặc tạo một thể loại để bắt đầu.</p>}
      </section>
    </div>}
    {editor && <Modal title={editor.id ? "Sửa thể loại" : "Thêm thể loại"} busy={busy} close={() => setEditor(null)}>
      <form onSubmit={e => { e.preventDefault(); if (!editor.name.trim()) { setFormError("Vui lòng nhập tên thể loại."); return; } mutate(() => genreApi.save(editor.id, { name: editor.name.trim(), description: editor.description.trim() }), "Đã lưu thể loại.", () => setEditor(null)); }}>
        <label className="genre-field">Tên thể loại<input autoFocus required maxLength={100} value={editor.name} disabled={busy} onChange={e => setEditor({ ...editor, name: e.target.value })} /></label>
        <label className="genre-field">Mô tả<textarea maxLength={2000} rows={4} value={editor.description} disabled={busy} onChange={e => setEditor({ ...editor, description: e.target.value })} /></label>
        {formError && <p className="commerce-error" role="alert">{formError}</p>}
        <button className="commerce-button" disabled={busy} type="submit">{busy ? "Đang lưu…" : "Lưu thể loại"}</button>
      </form>
    </Modal>}
    {deleting && <Modal title="Xóa thể loại?" busy={busy} close={() => setDeleting(null)}>
      <p>Bạn muốn xóa thể loại <strong>{deleting.name}</strong>?</p>
      {deleting.game_count > 0 && <p>Thể loại đang gắn với {deleting.game_count} trò chơi. Hãy gỡ các liên kết trước khi xóa.</p>}
      {formError && <p className="commerce-error" role="alert">{formError}</p>}
      <button className="commerce-button danger" disabled={busy || deleting.game_count > 0} onClick={() => mutate(() => genreApi.delete(deleting.id), "Đã xóa thể loại.", () => setDeleting(null))}>Xác nhận xóa</button>
    </Modal>}
  </>;
}
