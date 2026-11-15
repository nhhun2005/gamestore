import { useState } from 'react';
import { Modal } from '../../components/commerce/CommerceUI';
import { useCommerce } from '../../components/commerce/context';
import { useOperation } from '../../components/commerce/useOperation';

export function CollectionDialog({ collection: initialCollection, deleting, close, done }) {
  const { service } = useCommerce();
  // A successful delete refreshes the shared snapshot before this dialog closes.
  const [collection] = useState(initialCollection);
  const [name, setName] = useState(collection?.name || '');
  const operation = useOperation();
  return <Modal title={deleting ? 'Xóa bộ sưu tập' : collection ? 'Đổi tên bộ sưu tập' : 'Tạo bộ sưu tập'} close={close} {...operation}>
    {deleting ? <>
      <p>Xóa bộ sưu tập “{collection.name}”? Các game đã mua, ghi chú và đánh giá vẫn được giữ trong thư viện.</p>
      <button className="commerce-button primary" disabled={operation.busy} onClick={() => operation.run(() => service.deleteCollection(collection.id), done)}>Xác nhận xóa bộ sưu tập</button>
    </> : <form onSubmit={(event) => {
      event.preventDefault();
      operation.run(() => collection ? service.renameCollection(collection.id, name) : service.createCollection(name), done);
    }}>
      <label htmlFor="collection-name">Tên bộ sưu tập</label>
      <input id="collection-name" className="commerce-input" value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} />
      <button className="commerce-button primary" disabled={operation.busy || !name.trim()}>{operation.busy ? 'Đang lưu…' : 'Lưu bộ sưu tập'}</button>
    </form>}
  </Modal>;
}

export function AddCollectionGameDialog({ collection, games, close, done }) {
  const { service } = useCommerce();
  const [gameId, setGameId] = useState(games[0]?.id || '');
  const operation = useOperation();
  return <Modal title="Thêm game vào bộ sưu tập" close={close} {...operation}>
    <p>Bộ sưu tập: {collection.name}. Chỉ thêm được game bạn đã sở hữu.</p>
    {games.length ? <form onSubmit={(event) => {
      event.preventDefault();
      operation.run(() => service.collectionGame(collection.id, gameId, true), () => done(gameId));
    }}>
      <label htmlFor="collection-game">Game trong thư viện</label>
      <select id="collection-game" className="commerce-input" value={gameId} onChange={(event) => setGameId(event.target.value)}>
        {games.map((game) => <option key={game.id} value={game.id}>{game.title}</option>)}
      </select>
      <button className="commerce-button primary" disabled={operation.busy || !gameId}>Thêm vào bộ sưu tập</button>
    </form> : <p>Tất cả game đã sở hữu đều đã có trong bộ sưu tập này.</p>}
  </Modal>;
}

export function LibraryNoteDialog({ game, preference, close, done }) {
  const { service } = useCommerce();
  const [note, setNote] = useState(preference.note);
  const operation = useOperation();
  return <Modal title={`Ghi chú · ${game.title}`} close={close} {...operation}>
    <form onSubmit={(event) => {
      event.preventDefault();
      operation.run(() => service.saveLibraryPreference(game.id, note, preference.hidden), done);
    }}>
      <label htmlFor="library-note">Ghi chú riêng tư</label>
      <textarea id="library-note" className="commerce-input" rows={5} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
      <p className="commerce-note">Chỉ tài khoản của bạn thấy ghi chú này. Để trống rồi lưu để xóa ghi chú.</p>
      <button className="commerce-button primary" disabled={operation.busy}>Lưu ghi chú</button>
    </form>
  </Modal>;
}
