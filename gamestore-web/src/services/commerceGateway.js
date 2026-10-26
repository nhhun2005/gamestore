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
  revenue: (...args) => current().revenue(...args),
  reset: (...args) => current().reset(...args),
};
