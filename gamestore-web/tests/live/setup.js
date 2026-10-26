import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

// This fixture targets only the isolated local commerce_live_test database.
export default async function setup() {
  const api = "http://127.0.0.1:18080/api";
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${api}/commerce/state`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 401) {
        ready = true;
        break;
      }
    } catch {
      /* Spring Boot may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready)
    throw Error(
      "Start gamestore-backend/scripts/run-live-test-server.ps1 before running live tests.",
    );
  const password = "live-integration-test-only";
  const suffix = `${Date.now()}`;
  async function account(name) {
    const username = `${name}-${suffix}`;
    const response = await fetch(`${api}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email: `${username}@example.test`,
        password,
      }),
    });
    if (!response.ok)
      throw Error(`Live backend registration failed (${response.status})`);
    const data = await response.json();
    if (!/^[0-9a-f-]{36}$/.test(data.id))
      throw Error("Expected a UUID from the test backend");
    return { id: data.id, username, password, token: data.token };
  }
  const buyer = await account("live-buyer");
  const developer = await account("live-developer");
  const other = await account("live-other");
  const admin = await account("live-admin");
  const garden = { id: randomUUID(), title: `Live Garden ${suffix}` };
  const adventure = { id: randomUUID(), title: `Live Adventure ${suffix}` };
  const promo = randomUUID();
  const sql = `BEGIN;
    UPDATE users SET role='DEVELOPER' WHERE id IN ('${developer.id}','${other.id}');
    UPDATE users SET role='ADMINISTRATOR' WHERE id='${admin.id}';
    INSERT INTO promotions(id,name,discount,status) VALUES ('${promo}','Live test discount',25,'ENABLED');
    INSERT INTO games(id,developer_id,title,description,price,status,promotion_id,cover_image_url) VALUES
      ('${garden.id}','${developer.id}','${garden.title}','Real database integration test game',200000,'AVAILABLE','${promo}','https://cdn.akamai.steamstatic.com/steam/apps/413150/header.jpg'),
      ('${adventure.id}','${other.id}','${adventure.title}','Another developer real test game',100000,'AVAILABLE',NULL,NULL);
    INSERT INTO game_submissions(game_id,submitted_by) VALUES ('${garden.id}','${developer.id}'),('${adventure.id}','${other.id}');
    COMMIT;`;
  execFileSync(
    process.env.COMMERCE_TEST_PSQL ||
      resolve("../gamestore-backend/target/pg-runtime/pgsql/bin/psql.exe"),
    [
      "-X",
      "-h",
      "127.0.0.1",
      "-p",
      "55439",
      "-U",
      "commerce_test",
      "-d",
      "commerce_live_test",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { stdio: "pipe" },
  );
  mkdirSync("output", { recursive: true });
  writeFileSync(
    "output/live-fixture.json",
    JSON.stringify({ api, buyer, developer, admin, garden, adventure }),
  );
}
