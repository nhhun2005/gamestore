# Huỳnh's frontend flows — rebuilt on current main

Base: a fresh clone of `0c24e0339294e3b73d33ef78b9291a4ca9d37465`
(`Giao diện đăng nhập, đăng ký tạm, đã test`). The previous workspace is backed
up at `D:\lienquantoiduan\Monthaynghi-backup-20261025-120820`.

## Preparation and boundaries

Reviewed `docs/database-decisions.md`, both UCD/Class Diagram pages of
`docs/diagrams/Diagrams.drawio`, V1 schema, existing authentication contract and
the shared Navbar, GameCard, Store and management components.

Checklist completed in order: session/routing and data foundation; Wallet and
Transactions; Checkout; Library/Reviews; Revenue; automated checks and visual review.

The existing Login/Register implementations and API base URL are preserved,
including `onAuthSuccess` and `onNavigate` props. Developer Game Management and
Administrator User Management are unchanged. Existing Store/GameCard and Navbar
are extended for shared catalog data, checkout callbacks and URL navigation.
No backend business logic, database migrations or UML were modified. The local
ignored backend `application.yaml` was preserved during the fresh clone.

## Run

```sh
cd gamestore-web
npm ci
npm run dev
```

The first screen remains the existing **Đăng nhập** form. It calls
`http://localhost:8080/api/auth/login`; registration calls `/api/auth/register`
with the original request bodies. Successful authentication uses the original
`steam_jwt_token` key. Refresh restores the identity, expiry returns to Login,
and **Đăng xuất** removes the token and returns to Login. Protected destinations
are remembered across login/register. Cross-tab token changes refresh the session.

For real backend login, open **http://localhost:5173**. The existing backend CORS
configuration allows that origin (and localhost:3000), not 127.0.0.1:5173. No
backend CORS configuration was changed. The E2E loopback URL uses intercepted auth
responses and therefore does not verify live CORS connectivity.

Real authentication works independently of the commerce mock. In development a
real account gets commerce simulation records keyed by its actual ID/role; the
banner explicitly says **TÀI KHOẢN THẬT · THƯƠNG MẠI MÔ PHỎNG**. Its mock verified
status and starting balance do not represent its actual database balance/status.

## Demo evaluation

On the real Login screen, click **Thử Demo khi backend chưa sẵn sàng**, or visit
`/demo` on the development server. Select:

- **Huỳnh / USER**: wallet, purchases, library and reviews.
- **Aurora Studio / DEVELOPER**: own revenue and existing Game Management page.
- **Administrator / ADMINISTRATOR**: system revenue and existing User Management.

Demo identities are separate from real JWT authentication. Demo selection never
writes a JWT, and a signed-in real account must log out before entering Demo.
Demo identity uses sessionStorage key `gamestore.dev-session.v2`; commerce uses
localStorage key `gamestore.commerce.v2`. Old implementation keys are ignored.

All demo accounts start with 100,000 VND and empty transactions/library. Deposit
500,000, buy **Pixel Valley Farming** for 165,000, and the remaining balance is
435,000. The BUY transaction and permanent ownership appear immediately. Write,
edit and delete a review in Library. Switch identities to inspect revenue.
**Celeste** is free; **Dự án sắp ra mắt** is unavailable. Cyberpunk has an enabled
25% promotion; a disabled promotion fixture is also defined.

Use **Đặt lại dữ liệu** and confirm to reset all mock money, transactions,
ownership and reviews while preserving real JWT/backend data. A corrupted,
incompatible or unknown-version persisted mock starts fresh. Write failures abort
the operation before publishing any changes.

`import.meta.env.DEV` gates both Demo UI and the mock mutation/revenue service.
Production retains real Login/Register and role/management navigation; commerce
pages explain that their APIs are pending. Production does not pretend that mock
funds are a real account balance or execute simulated payments.

## Routes and use cases

| Route                 | Access                            | Flow                                                                       |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `/login`, `/register` | Anonymous                         | Existing real authentication                                               |
| `/demo`               | Development only, no real session | Fixture selector                                                           |
| `/store`              | Signed in                         | Existing catalog, search, game details and single-game checkout (UC14)     |
| `/wallet`             | Signed in                         | Balance, amount presets/custom input, confirmation, deposit history (UC05) |
| `/transactions`       | Signed in                         | IN/OUT/BUY, all statuses, sorting, filters, pagination (UC06)              |
| `/library`            | Signed in                         | Owned-game sidebar/search/sort/filter and review CRUD (UC15/16)            |
| `/developer/revenue`  | DEVELOPER                         | Own sales, daily chart, game performance and dates (UC20)                  |
| `/admin/revenue`      | ADMINISTRATOR                     | All sales, developers, best sellers, daily chart and dates (UC21)          |
| `/manage-games`       | DEVELOPER                         | Existing teammate page                                                     |
| `/manage-users`       | ADMINISTRATOR                     | Existing teammate page                                                     |

BrowserRouter supports direct paths, reload and Back/Forward. Configure production
hosting to serve `index.html` for non-asset paths. Frontend route guards only guide
the UI; actual API authorization must happen on the backend.

## Implementation

- `services/session.js`: adapter around the existing `parseJwt`, token key and auth
  response; a distinct development-only fixture identity. Navbar/logout and all
  commerce methods read the same current identity.
- `services/currency.js`: decimal strings compatible with NUMERIC(19,2), BigInt
  arithmetic in hundredths of VND, arbitrary fractional percentage discounts,
  half-up rounding to the database's two decimal places, VND formatting and
  Vietnamese calendar dates (UTC+7).
- `mocks/commerceSeed.js`: stable UUID fixtures, users.balance, games, promotions,
  transactions, game_bought and reviews matching the relevant database fields.
  `genre` and artwork are catalog presentation metadata.
- `services/commerceService.js`: async, session-bound API (`prepareAccount`,
  `topUp`, `purchase`, `saveReview`, `deleteReview`, `revenue`, `reset`), subscribed
  snapshot cache, validation, atomic draft commits and in-tab submission locking.
  Pages cannot request a different user's identity by passing an ID.
- `components/commerce`: shared native dialog with focus restoration and error
  feedback; price/artwork/table/chart/empty/header components; operation lock hook;
  lightweight React context supplying the repository and current identity.
- `pages/Checkout`, `Wallet`, `Transactions`, `Reviews`, `Revenue`: feature views.
  Library replaces its prior placeholder. `commerce.css` extends shared Steam
  styles with responsive layouts and visible keyboard focus, without replacing
  teammate auth styles.

Business rules preserve database enum spellings, including `SUCCESSED`. The demo
generates successful IN/BUY rows; PENDING/FAILED and OUT are supported by display
and filtering but do not invent additional banking features. Successful purchases
are immutable; no ownership removal or refunds. The mock simulates the V2 trigger
that creates `game_bought`; real API clients must not insert ownership themselves.
Ownership timestamps come from the referenced transaction, not an invented column.

Reviews require ownership and one row per user/game; scores are 1–5 in steps of
0.5 and content is 1–2,000 characters. Aggregate `games.rating` is recalculated
after CRUD. Revenue includes only `BUY/SUCCESSED`, sums the recorded amount and
never recalculates it from current catalog prices. Developer scoping happens
inside the service as well as the UI. Deposits are never sales revenue.

## Backend handoff

Keep Login/Register and session/token handling. Replace `commerceService` with a
real asynchronous repository implementing the same DTOs and subscription cache;
load its snapshot in `prepareAccount` and update subscribers after API responses.
Use real catalog/ownership/review data, remove the production placeholder when
those endpoints exist, and change the development mock gate to a real adapter.
No production commerce endpoints were invented in this iteration.

The backend must derive the user from JWT, enforce role/VERIFIED/ownership, lock
wallet rows, apply promotions, prevent duplicate callbacks/purchases, and rely on
the V2 ownership/rating triggers. Integrate bank verification for deposits. Never
trust localStorage balance or frontend guards. Confirm decimal JSON serialization,
date-range semantics and server pagination/error DTOs before connecting APIs.

## Verification

```sh
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Node tests cover the complete state journey, decimal/fractional promotion math,
historic purchase prices, role scoping, anonymous/expired sessions, unavailable,
free and duplicate purchases, insufficient funds, duplicate submissions,
identity changes mid-operation, reviews, empty states, reset, failed persistence
and corrupt storage. Browser tests cover all seven use cases, real Login/Register
callbacks, login return paths, JWT persistence/logout, management navigation,
invalid/expired login, role restrictions, date filtering, mobile/Back/Forward and
production Demo exclusion. Auth HTTP responses are intercepted fixtures: these
tests do not assert that a live backend/database accepted a credential.

Screenshots/traces go to ignored `output/playwright/`. Store, Revenue and mobile
Library screenshots have been visually inspected. No backend or database tests
were run by this frontend change.

Final executed results: `npm run lint` clean; `npm run build` successful;
`npm test` 8/8 passed; `npm run test:e2e` 5/5 passed; `git diff --check` no
whitespace errors. Compared with fresh HEAD, Login/Register, both management
pages, backend and existing documentation/UML have no changes. The rebuilt flow
also addresses stale/expired sessions, return-to-page after login, identity changes
while a purchase is pending, corrupt mock storage and decimal-price arithmetic.

## Limitations

Commerce remains a development simulation. Real authentication requires the
existing backend on port 8080; its connectivity was not verified against a live
database. New real developers have no fixture games and therefore no mock sales.
Game artwork is illustrative external Steam CDN imagery for fictional catalog
entries, with a local text/gradient fallback; replace it with the project's own
licensed assets for release. Persistence serializes writes within one tab and
does not provide cross-tab commerce locking/synchronization. Revenue chart scrolls
for long date ranges. Chrome desktop/mobile emulation was tested, not actual mobile
hardware, Firefox/Safari or a screen reader. Existing teammate auth/management
pages retain their prior UI, including their current functionality limits.

No game launch/install, community, chat, achievements, Workshop or ownership deletion.

## File inventory

Modified: `src/App.jsx`, `src/components/Navbar/Navbar.jsx`,
`src/components/GameCard/GameCard.jsx`, `src/pages/Store/StorePage.jsx`,
`src/pages/Library/LibraryPage.jsx`, `package.json`, `package-lock.json`,
`.gitignore`, `index.html`, and `README.md`.

Created: `src/commerce.css`, `src/services/session.js`,
`src/services/currency.js`, `src/services/commerceService.js`,
`src/mocks/commerceSeed.js`, `src/components/commerce/context.js`,
`src/components/commerce/useOperation.js`, `src/components/commerce/CommerceUI.jsx`,
`src/pages/Wallet/WalletPage.jsx`, `src/pages/Transactions/TransactionsPage.jsx`,
`src/pages/Checkout/CheckoutDialog.jsx`, `src/pages/Reviews/ReviewDialog.jsx`,
`src/pages/Revenue/RevenuePage.jsx`, `tests/commerce.test.js`,
`tests/e2e/flows.spec.js`, `playwright.config.js` and this document.

Unchanged: Login/Register source/styles and `utils/auth.js`, both management
pages, all backend files, migrations and existing database/UML documents.
