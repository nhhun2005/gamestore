import { useEffect, useRef, useState } from "react";

const SIZE = 512;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function GameImageCropper({ file, busy, cancel, upload }) {
  const canvas = useRef(null);
  const dragging = useRef(null);
  const processing = useRef(false);
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const source = new Image();
    let active = true;
    source.onload = () => {
      if (!active) return;
      if (source.naturalWidth * source.naturalHeight > 40_000_000) {
        setError("Ảnh quá lớn để xử lý. Vui lòng chọn ảnh dưới 40 megapixel.");
        return;
      }
      setImage(source);
    };
    source.onerror = () => {
      if (active) setError("Không đọc được ảnh. Vui lòng chọn ảnh khác.");
    };
    source.src = url;
    return () => {
      active = false;
      source.onload = null;
      source.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const scale = image
    ? Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight) * zoom
    : 1;
  const overflowX = image ? image.naturalWidth * scale - SIZE : 0;
  const overflowY = image ? image.naturalHeight * scale - SIZE : 0;
  useEffect(() => {
    if (!image) return;
    const context = canvas.current.getContext("2d");
    context.clearRect(0, 0, SIZE, SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      (-overflowX * (position.x + 1)) / 2,
      (-overflowY * (position.y + 1)) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
  }, [image, scale, overflowX, overflowY, position]);

  async function confirm() {
    if (!image || busy || processing.current) return;
    processing.current = true;
    setError("");
    try {
      const blob = await new Promise((resolve, reject) =>
        canvas.current.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(Error("Không tạo được ảnh đã crop. Vui lòng thử lại.")),
          "image/png",
        ),
      );
      await upload(new File([blob], "game-cover.png", { type: "image/png" }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      processing.current = false;
    }
  }

  return (
    <section className="game-image-cropper" aria-label="Crop ảnh bìa">
      <h3>Crop ảnh bìa · 512×512 px</h3>
      <p>
        Kéo ảnh hoặc dùng thanh trượt để chọn vùng ảnh vuông. Ảnh chỉ được tải
        lên sau khi xác nhận.
      </p>
      {!image && !error && <p role="status">Đang đọc ảnh…</p>}
      <canvas
        ref={canvas}
        width={SIZE}
        height={SIZE}
        aria-label="Xem trước vùng crop 512×512"
        className="game-crop-canvas"
        onPointerDown={(event) => {
          if (!image || busy) return;
          dragging.current = { x: event.clientX, y: event.clientY, position };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging.current || busy) return;
          const ratio =
            SIZE / event.currentTarget.getBoundingClientRect().width;
          const start = dragging.current;
          setPosition({
            x:
              overflowX > 0
                ? clamp(
                    start.position.x -
                      (2 * (event.clientX - start.x) * ratio) / overflowX,
                    -1,
                    1,
                  )
                : 0,
            y:
              overflowY > 0
                ? clamp(
                    start.position.y -
                      (2 * (event.clientY - start.y) * ratio) / overflowY,
                    -1,
                    1,
                  )
                : 0,
          });
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        onLostPointerCapture={() => {
          dragging.current = null;
        }}
      />
      <label className="genre-field">
        Thu phóng ảnh
        <input
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          disabled={!image || busy}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
      <label className="genre-field">
        Vị trí ngang
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={position.x}
          disabled={!image || busy || overflowX < 1}
          onChange={(e) =>
            setPosition((current) => ({
              ...current,
              x: Number(e.target.value),
            }))
          }
        />
      </label>
      <label className="genre-field">
        Vị trí dọc
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={position.y}
          disabled={!image || busy || overflowY < 1}
          onChange={(e) =>
            setPosition((current) => ({
              ...current,
              y: Number(e.target.value),
            }))
          }
        />
      </label>
      {error && (
        <p className="commerce-error" role="alert">
          {error}
        </p>
      )}
      <div className="genre-actions">
        <button
          className="commerce-button secondary"
          type="button"
          disabled={busy}
          onClick={cancel}
        >
          Hủy crop
        </button>
        <button
          className="commerce-button primary"
          type="button"
          disabled={!image || busy}
          onClick={confirm}
        >
          {busy ? "Đang tải ảnh…" : "Dùng ảnh 512×512"}
        </button>
      </div>
    </section>
  );
}
