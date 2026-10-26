import { useState } from "react";
import { gameApi } from "../../services/gameApi";
import GameImageCropper from "./GameImageCropper";

export default function GameEditor({
  game,
  genres,
  developers,
  user,
  busy,
  error,
  save,
}) {
  const admin = user.role === "ADMINISTRATOR";
  const [form, setForm] = useState(() => ({
    title: game?.title || "",
    description: game?.description || "",
    price: game?.price || "0.00",
    cover_image_url: game?.cover_image_url || "",
    version: game?.version || "1.0",
    genre_ids: game?.genre_ids || [],
    status: game?.status || "HIDDEN",
    developer_id: user.id,
  }));
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const disabled = busy || uploading || Boolean(cropFile);
  const field = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));
  function chooseImage(file) {
    if (!file || disabled) return;
    setLocalError("");
    if (
      file.size > 5 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setLocalError("Chọn ảnh JPEG, PNG hoặc WebP, tối đa 5 MB.");
      return;
    }
    setCropFile(file);
  }
  async function upload(file) {
    if (busy || uploading) return;
    setUploading(true);
    setLocalError("");
    try {
      const result = await gameApi.upload(file);
      field("cover_image_url", result.url);
      setCropFile(null);
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form
      className="game-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        setLocalError("");
        if (!form.genre_ids.length) {
          setLocalError("Vui lòng chọn ít nhất 1 thể loại.");
          return;
        }
        if (!form.title.trim()) {
          setLocalError("Vui lòng nhập tên trò chơi.");
          return;
        }
        if (!/^\d{1,17}(\.\d{1,2})?$/.test(form.price)) {
          setLocalError("Giá phải không âm và có tối đa 2 chữ số thập phân.");
          return;
        }
        const body = {
          title: form.title.trim(),
          description: form.description.trim(),
          price: form.price,
          cover_image_url: form.cover_image_url.trim() || null,
          version: form.version.trim(),
          genre_ids: form.genre_ids,
        };
        if (admin) {
          body.status = form.status;
          if (!game) body.developer_id = form.developer_id;
        }
        save(body);
      }}
    >
      <label className="genre-field">
        Tên trò chơi
        <input
          autoFocus
          required
          maxLength={200}
          value={form.title}
          disabled={disabled}
          onChange={(e) => field("title", e.target.value)}
        />
      </label>
      <label className="genre-field">
        Mô tả trò chơi
        <textarea
          rows={4}
          maxLength={10000}
          value={form.description}
          disabled={disabled}
          onChange={(e) => field("description", e.target.value)}
        />
      </label>
      <div className="game-form-columns">
        <label className="genre-field">
          Giá (VND)
          <input
            required
            inputMode="decimal"
            value={form.price}
            disabled={disabled}
            onChange={(e) => field("price", e.target.value)}
          />
        </label>
        <label className="genre-field">
          Phiên bản
          <input
            maxLength={100}
            value={form.version}
            disabled={disabled}
            onChange={(e) => field("version", e.target.value)}
          />
        </label>
      </div>
      {admin && (
        <div className="game-form-columns">
          {!game && (
            <label className="genre-field">
              Chủ sở hữu
              <select
                disabled={disabled}
                value={form.developer_id}
                onChange={(e) => field("developer_id", e.target.value)}
              >
                {developers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.username}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="genre-field">
            Trạng thái game
            <select
              disabled={disabled}
              value={form.status}
              onChange={(e) => field("status", e.target.value)}
            >
              <option value="HIDDEN">HIDDEN · Đang ẩn</option>
              <option value="AVAILABLE">AVAILABLE · Phát hành</option>
            </select>
          </label>
        </div>
      )}
      <fieldset className="game-genre-picker" disabled={disabled}>
        <legend>Thể loại (bắt buộc chọn ít nhất 1)</legend>
        {!genres.length && (
          <p>Chưa có thể loại. Quản trị viên cần tạo thể loại trước.</p>
        )}
        <div>
          {genres.map((genre) => (
            <label key={genre.id}>
              <input
                type="checkbox"
                checked={form.genre_ids.includes(genre.id)}
                onChange={(e) =>
                  field(
                    "genre_ids",
                    e.target.checked
                      ? [...form.genre_ids, genre.id]
                      : form.genre_ids.filter((id) => id !== genre.id),
                  )
                }
              />
              {genre.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="genre-field">
        Tải ảnh bìa (JPEG, PNG, WebP · tối đa 5 MB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(e) => {
            chooseImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p className="commerce-note">
        Ảnh bìa được crop vuông và lưu ở kích thước 512×512 px.
      </p>
      {cropFile && (
        <GameImageCropper
          key={`${cropFile.name}-${cropFile.lastModified}`}
          file={cropFile}
          busy={busy || uploading}
          cancel={() => {
            setCropFile(null);
            setLocalError("");
          }}
          upload={upload}
        />
      )}
      {uploading && <p role="status">Đang tải ảnh lên Cloudinary…</p>}
      {form.cover_image_url.startsWith("https://") && (
        <img
          key={form.cover_image_url}
          className="game-cover-preview"
          src={form.cover_image_url}
          alt="Xem trước ảnh bìa"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      {!admin && (
        <p className="commerce-note">
          {game
            ? "Sửa nội dung sẽ ẩn trò chơi và yêu cầu duyệt lại. Chỉ ẩn/bật lại không làm mất kết quả duyệt hiện tại."
            : "Trò chơi được tạo ở trạng thái HIDDEN. Sau khi lưu, nhấn Đăng tải trò chơi trên thẻ để gửi đơn xét duyệt."}
        </p>
      )}
      {(localError || error) && (
        <p className="commerce-error" role="alert">
          {localError || error}
        </p>
      )}
      <button
        className="commerce-button primary"
        type="submit"
        disabled={disabled || !genres.length}
      >
        {busy ? "Đang lưu…" : game ? "Lưu thay đổi" : "Tạo trò chơi"}
      </button>
    </form>
  );
}
