# GameStore commerce — frontend and backend

The seven Huỳnh use cases now use real Spring Boot APIs for JWT accounts. Wallet,
purchases, ownership, reviews and revenue are persisted in PostgreSQL. The existing
Login/Register contract and `steam_jwt_token` key remain in use.

Start the backend in `gamestore-backend` with `mvnw.cmd spring-boot:run`; start this
frontend with `npm ci` and `npm run dev`. Open http://localhost:5173/login. Optional
`VITE_API_BASE_URL` is documented in `.env.example`; restart Vite after changing it.
See [backend README](../gamestore-backend/README.md) for configuration, API requests,
profiles, migrations and dedicated test-database setup.

## Data paths

- JWT account → `commerceGateway` → `commerceApi` → JWT-protected HTTP endpoints.
- Development `/demo` identity → existing centralized browser mock repository.
- Production never allows Demo identities and never falls back to mock money.

The HTTP adapter refreshes the shared snapshot after each mutation, retains the
server's decimal money strings, isolates caches by account, ignores stale fetch
responses, sends Bearer tokens and stable per-dialog idempotency keys, and clears
invalid sessions on 401. Purchase submits the displayed final price as an optional
quote guard; a 409 refreshes catalog data for the next confirmation. A network
error is shown without inventing a successful payment or local balance update.

A real account starts with its actual database balance (zero for a new registration).
No fixture credit is assigned. In development, the backend `local` profile allows
clearly labeled test top-ups that write to the database without collecting bank
money. Without that explicit flag the top-up button is disabled; the application
does not provide a production bank/payment gateway.

## Flows and navigation

| Route                            | Access / behavior                                                |
| -------------------------------- | ---------------------------------------------------------------- |
| `/login`, `/register`            | Existing real auth forms; return to requested page               |
| `/demo`                          | Development only; no real JWT/account                            |
| `/store`                         | Authenticated; actual catalog, details, checkout                 |
| `/wallet`                        | Actual balance, development-credit confirmation, recent deposits |
| `/transactions`                  | Own IN/OUT/BUY history with filters/sorting/pagination           |
| `/library`                       | Actual permanent ownership; search/sort/filter and review access |
| `/developer/revenue`             | DEVELOPER, own game sales only                                   |
| `/admin/revenue`                 | ADMINISTRATOR, system gross sales and developer breakdown        |
| `/manage-games`, `/manage-users` | Existing teammate pages, preserved                               |

Back/Forward, deep links and reload work through BrowserRouter. SPA hosting must
rewrite non-asset paths to index.html. Role navigation follows the server profile;
backend checks remain authoritative. Explicit logout resets the redirect destination,
so signing in as another role does not land on the old role's dashboard.

## Rules and components

`services/currency.js` uses decimal strings and BigInt cents to match NUMERIC(19,2).
Only enabled promotions apply. The backend independently calculates BigDecimal
prices and checks wallet/account/game eligibility in one transaction. Free purchases
still create a successful BUY and permanent ownership. The existing V2 trigger
creates game_bought; there is no separate ownership insertion by the frontend.

Ownership dates derive from the referenced transaction. Reviews are one per owner/game,
ratings 1–5 in 0.5 steps; create/edit/delete refresh aggregate game ratings. Revenue
uses successful BUY amounts recorded at purchase, excludes IN and uses UTC+7 date
boundaries. No launch/install, chat/community or ownership removal is implemented.

`components/commerce` contains native focus-managed dialogs, artwork/price/table/chart
components, empty states, shared context and an operation lock hook. Feature views
are in Wallet, Transactions, Checkout, Library, Reviews and Revenue. Existing Store,
GameCard and Navbar have small integration extensions. Login/Register and management
page implementations remain otherwise unchanged; auth API base URL is configurable.

## Demo mode

On the development Login page choose **Thử Demo khi backend chưa sẵn sàng**. USER,
DEVELOPER and ADMINISTRATOR fixtures share `gamestore.commerce.v2` localStorage and
an isolated sessionStorage identity. They start with 100,000 VND. For example,
deposit 500,000 and buy Pixel Valley Farming for 165,000 to leave 435,000. This
example is exclusive to browser Demo, not a newly registered backend account.

**Đặt lại dữ liệu** is available only for Demo. It resets browser fixtures and never
calls an API to delete database transactions/ownership. Real accounts have no reset
button and never put commerce records in localStorage. JWT storage remains separate.

## Checks

```sh
npm run lint
npm run build
npm test
npm run test:e2e
npm run test:live
```

Standard E2E uses controlled HTTP fixtures for JWT/account flows and browser-only
fixtures for Demo; live E2E uses the real server, real JWT verification, Flyway and
PostgreSQL. See the backend README for the live server/database prerequisites.
Tests/screenshots/traces are under ignored `output/`. Current verified totals:
12 Node tests, 5 standard browser scenarios, 1 live browser scenario, plus 32 Maven
backend/database tests. Desktop and mobile-emulated layouts were inspected.

New integration files: `services/commerceApi.js`, `services/commerceGateway.js`,
`tests/commerceApi.test.js`, `tests/live`, `playwright.live.config.js` and `.env.example`.
App, session, auth URL configuration, Wallet, Checkout and Store now use the server
adapter and quote/idempotency handling. Backend implementation/API documentation
and the new additive V3 migration are detailed in the backend README.

## Limitations

Actual bank/PSP callbacks are pending. Real Store needs actual AVAILABLE catalog
records, created with required game_submissions by the team's game-publishing flow;
fixture artwork/catalog data is only used in Demo/tests. Initial snapshot currently
loads all own history and visible public reviews; the backend also provides a
paginated history endpoint for larger datasets. There is no real-time cross-tab
commerce refresh stream. Firefox/Safari, mobile hardware and screen-reader testing
were not performed. Existing teammate management pages keep their previous scope.
