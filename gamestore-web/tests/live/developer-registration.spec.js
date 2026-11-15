import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

test("real developer application procedures: submit, duplicate, review and role update", async ({ request }) => {
  const f = JSON.parse(readFileSync("output/live-fixture.json", "utf8"));
  const applicantHeaders = { Authorization: `Bearer ${f.applicant.token}` };
  const adminLogin = await request.post(`${f.api}/auth/login`, { data: { account: f.admin.username, password: f.admin.password } });
  expect(adminLogin.ok()).toBeTruthy();
  const adminHeaders = { Authorization: `Bearer ${(await adminLogin.json()).token}` };
  const submitted = await request.post(`${f.api}/developer/submissions`, { headers: applicantHeaders, data: { application_reason: "Tôi muốn phát hành trò chơi do mình phát triển." } });
  expect(submitted.status()).toBe(201);
  const application = await submitted.json();
  expect(application.status).toBe("PENDING");
  const duplicate = await request.post(`${f.api}/developer/submissions`, { headers: applicantHeaders, data: { application_reason: "Yêu cầu trùng" } });
  expect(duplicate.status()).toBe(409);
  const reviewed = await request.put(`${f.api}/developer/admin/submissions/${application.id}/review`, { headers: adminHeaders, data: { status: "ACCEPTED", reason: "Đủ điều kiện phát triển trò chơi." } });
  expect(reviewed.status()).toBe(200);
  expect((await reviewed.json()).status).toBe("ACCEPTED");
  const account = await request.get(`${f.api}/commerce/state`, { headers: applicantHeaders });
  expect(account.ok()).toBeTruthy();
  expect((await account.json()).current_user.role).toBe("DEVELOPER");
  const own = await request.get(`${f.api}/developer/submissions`, { headers: applicantHeaders });
  expect((await own.json()).some((item) => item.id === application.id && item.status === "ACCEPTED")).toBeTruthy();
});
