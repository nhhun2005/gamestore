export const decisionLabel = (status) =>
  ({ PENDING: "Chờ duyệt", ACCEPTED: "Đã duyệt", REJECTED: "Bị từ chối" })[
    status
  ] || status;
export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
