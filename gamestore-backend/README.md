# GameStore backend

Java 21, Spring Boot, PostgreSQL, Flyway and JWT. Commerce APIs implement UC05,
UC06, UC14–16 and UC20–21 alongside the existing Login/Register endpoints.

## Run

Keep your local ignored `src/main/resources/application.yaml`, or copy
`application.yml.example` and configure `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`,
and a private `JWT_SECRET` of at least 32 bytes. No real secrets are in this document.

```powershell
.\mvnw.cmd spring-boot:run
```

Backend listens on 8080. Start the frontend with `npm run dev` and open
`http://localhost:5173/login`. Both localhost and 127.0.0.1 dev origins are allowed;
deployment origins are configurable with `app.cors.allowed-origins`.
JWT accounts now call real APIs and use real database balances/history. Fresh
registrations have the database default balance of zero. The frontend does not
fall back to a mock wallet if the API fails. Development Demo identities still
use separate browser-only fixtures and never become authenticated backend users.

For development **test credits**, explicitly enable the local profile:

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

This enables `POST /wallet/demo-topups`: it writes real IN transactions and balance
changes in the configured database, but **does not collect or verify bank money**.
It is disabled by default (503), must remain disabled in production, and does not
represent a payment-gateway integration. Only authenticated VERIFIED accounts can
credit their own wallets. Actual bank/PSP callbacks must be implemented separately
with signed payment verification before enabling production top-ups.

No catalog or privileged account fixtures are inserted into the application's
configured database. Store uses actual AVAILABLE games and their existing
submissions/genres; game publishing and user-management workflows remain teammates'
scope. An empty real catalog needs valid game data from those workflows.

## APIs

All commerce routes require `Authorization: Bearer <JWT>` and resolve the user and
current role/status from the database, not a caller-supplied user/developer ID.

| Method | Path under `/api/commerce` | Result |
| --- | --- | --- |
| GET | `/state` | Account, visible catalog/promotions, own history/ownership, public reviews |
| GET | `/wallet` | Own balance and account status |
| GET | `/transactions` | Own paginated transactions; type/status/sort filters |
| POST | `/wallet/demo-topups` | Development credit, body `{"amount":"500000.00"}` |
| POST | `/purchases` | Single-game purchase; `{"game_id":"UUID","expected_amount":"150000.00"}` |
| PUT | `/games/{gameId}/review` | Create/update own review: `{"rating":4.5,"content":"..."}` |
| DELETE | `/reviews/{reviewId}` | Delete own review; 204 |
| GET | `/revenue?from=2026-10-01&to=2026-10-31` | Own-developer or system-admin successful sales |

Transaction filters: `page` starts at 0, `size` is 1–100, `type` is IN/OUT/BUY,
`status` is PENDING/SUCCESSED/FAILED, and `sort` is newest/oldest/amount. The
snapshot supports the current frontend; the dedicated paginated endpoint is
available for larger history views. Snapshot currently loads all own transactions
and public reviews of visible games; large installations should paginate those.

Money is returned as decimal strings with two places, in VND. Prices use
BigDecimal and HALF_UP rounding once to the database scale. Ratings remain JSON
numbers with allowed half-step values. Dates are ISO instants. Revenue date
boundaries are inclusive calendar days in Asia/Ho_Chi_Minh.

For credit/purchase POSTs, provide a UUID **Idempotency-Key** header. Keep the same
key for retries of one user-confirmed action. A successful retry returns the same
transaction without applying money twice. Reusing the key with different inputs
returns 409. `expected_amount` is an optional checkout quote guard for older clients;
the current frontend always sends it, and the server rejects a changed quote
without debiting. The server always computes the authoritative price itself.

Error bodies have `message`. Statuses include 400 validation, 401 missing/invalid
JWT, 402 insufficient balance, 403 account/role/ownership denial, 404 missing record,
409 duplicate/changed quote, and 503 disabled test top-ups.

## Transactions and authorization

- `CommerceRepository` uses parameterized JDBC queries. `CommerceService` owns
  business transactions and controller DTOs keep password/email/private balances
  out of public user summaries. Revenue does not expose buyers or request keys.
- Wallet writes lock the current user row, then the game/promotion as needed.
  Debit/credit, successful transaction and ownership trigger either all commit or
  all roll back. Concurrent purchases cannot overdraw the wallet.
- Migration V3 adds a nullable request key and a per-user unique index. V1/V2 are
  unchanged. Flyway applies V3 additively; there is no data reset/backfill.
- Successful BUY rows remain immutable. V2 creates ownership automatically;
  the application does not insert `game_bought` a second time. No refunds or
  purchased-game deletion were added.
- Only owners can review. Upsert enforces one review per user/game; author-only
  deletion and V2 rating triggers maintain aggregates. Hidden owned games remain
  in Library; unavailable games cannot be newly purchased.
- Revenue includes only BUY/SUCCESSED recorded amounts, never deposits/current
  catalog prices. DEVELOPER scope uses games.developer_id; ADMINISTRATOR sees all.
  Stale role claims cannot preserve revoked privileges because DB roles are checked.
- Snapshot/history reads use repeatable-read transactions, so a concurrent purchase
  does not mix an old balance with a new ownership/history in the same response.
- BANNED/PENDING accounts cannot use commerce or log in. Signature/expiry failures
  produce 401 rather than an unhandled JWT exception.

## Tests (separate local PostgreSQL only)

Tests use the `test` profile and default to `127.0.0.1:55439/commerce_test`, never
the configured application database. A context initializer refuses non-loopback
URLs and database names not ending `_test`, before Flyway initializes.
Use TEST_DB_URL/TEST_DB_USERNAME/TEST_DB_PASSWORD for another local test database.

With PostgreSQL tools installed:

```powershell
.\scripts\start-test-db.ps1 -PostgresBin "C:\path\to\postgresql\bin"
.\mvnw.cmd test
```

This creates a disposable loopback cluster under `target/commerce-postgres`, user
`commerce_test` with local trust authentication, and databases `commerce_test`
and `commerce_live_test`. Do not use this cluster for real data. A previously
downloaded runtime under `target/pg-runtime/pgsql/bin` is the script's default.
The optional runtime is from the [official EDB binary archive](https://www.enterprisedb.com/download-postgresql-binaries).
It and all database/log files are ignored build artifacts.

Live browser integration (no intercepted commerce/auth responses):

```powershell
# In a separate backend terminal after start-test-db.ps1:
.\scripts\run-live-test-server.ps1
# In a frontend terminal:
cd ..\gamestore-web
$env:COMMERCE_TEST_PSQL = "C:\path\to\postgresql\bin\psql.exe" # optional if bundled runtime exists
npm run test:live
```

The helper server uses only commerce_live_test on port 18080; the live browser uses
5180. Setup creates disposable user/developer/admin accounts and games in that
test database. Repeated runs use new fixture identifiers. It does not seed the
database used by the normal 8080 server.

Verified: 32 Maven tests (9 API, 2 pricing/profile, 20 database rules, 1 context),
12 frontend Node tests, 5 standard Playwright scenarios, and 1 live full-stack
browser journey. Live journey covers database deposits, discounts, purchase,
review CRUD, reload/logout and developer/admin revenue. Fixtures have no real money.

Stop the test server with Ctrl+C. Stop its temporary PostgreSQL cluster with
`pg_ctl -D target/commerce-postgres stop`. No test script drops real data.

## Remaining work

Real payment-provider verification/settlement, teammate catalog publishing/user
management APIs, and large-data pagination tuning are outside these seven commerce
flows. Frontend state is cached; refresh/re-fetch after mutations updates it.
Multi-tab writes are protected by the server but another tab refreshes its commerce
view on reload; there is no push notification stream.
