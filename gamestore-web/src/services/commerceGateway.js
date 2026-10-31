import { session } from "./session";
import { commerceApi } from "./commerceApi";
import { commerceService as mock } from "./commerceService";
const current = () =>
  session.snapshot()?.source === "demo" && import.meta.env.DEV
    ? mock
    : commerceApi;
export const commerceGateway = {
  snapshot: () => current().snapshot(),
  subscribe(fn) {
    const a = mock.subscribe(fn);
    const b = commerceApi.subscribe(fn);
    return () => {
      a();
      b();
    };
  },
  prepareAccount: (...args) => current().prepareAccount(...args),
  topUp: (...args) => current().topUp(...args),
  purchase: (...args) => current().purchase(...args),
  saveReview: (...args) => current().saveReview(...args),
  deleteReview: (...args) => current().deleteReview(...args),
  addWishlist: (...args) => current().addWishlist(...args),
  removeWishlist: (...args) => current().removeWishlist(...args),
  notifications: (...args) => current().notifications(...args),
  markNotificationRead: (...args) => current().markNotificationRead(...args),
  markAllNotificationsRead: (...args) =>
    current().markAllNotificationsRead(...args),
  revenue: (...args) => current().revenue(...args),
  reset: (...args) => current().reset(...args),
};
