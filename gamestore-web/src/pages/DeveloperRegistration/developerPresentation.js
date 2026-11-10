export function statusLabel(status) {
  return { PENDING: "Chờ duyệt", ACCEPTED: "Đã chấp thuận", REJECTED: "Bị từ chối" }[status] || status || "Chưa rõ";
}
