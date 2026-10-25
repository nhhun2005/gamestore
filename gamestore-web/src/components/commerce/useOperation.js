import { useRef, useState } from "react";
export function useOperation() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action, done) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      done?.(result);
    } catch (failure) {
      setError(failure.message || "Không thể thực hiện. Vui lòng thử lại.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
