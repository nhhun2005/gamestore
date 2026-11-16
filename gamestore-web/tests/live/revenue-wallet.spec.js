import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { money } from '../../src/services/currency.js';

test('a hosted game purchase credits the developer wallet and that income can be withdrawn', async ({ page, request }) => {
  const f=JSON.parse(readFileSync('output/live-fixture.json','utf8'));
  async function auth(account) {
    const r=await request.post(`${f.api}/auth/login`,{data:{account:account.username,password:account.password}});
    expect(r.ok()).toBeTruthy();return {Authorization:`Bearer ${(await r.json()).token}`};
  }
  const buyer=await auth(f.applicant),dev=await auth(f.payDeveloper);
  const before=await (await request.get(`${f.api}/commerce/wallet`,{headers:dev})).json();
  const create=await request.post(`${f.api}/commerce/checkouts`,{headers:{...buyer,'Idempotency-Key':crypto.randomUUID()},data:{game_id:f.payQrGame.id,expected_amount:f.payQrGame.price}});
  expect(create.status()).toBe(201);const c=await create.json();
  const data={method:'QR',bank:'BIDV',qr_code:new URL(c.qr_payload).searchParams.get('code')};
  for(let n=0;n<2;n++) expect((await request.post(`${f.api}/commerce/checkouts/${c.id}/confirm`,{headers:buyer,data})).ok()).toBeTruthy();
  const after=await (await request.get(`${f.api}/commerce/wallet`,{headers:dev})).json();
  expect(Number(after.balance)).toBe(Number(before.balance)+116100);
  await page.goto('/login');
  await page.getByPlaceholder('Nhập username hoặc email...').fill(f.payDeveloper.username);
  await page.getByPlaceholder('••••••••').fill(f.payDeveloper.password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page).toHaveURL(/store/);await page.goto('/wallet');
  await expect(page.getByRole('heading',{name:money(after.balance),exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:'Doanh thu IN',exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Rút tiền',exact:true}).click();
  await page.getByLabel('Số tiền rút (VND)').fill('116100');
  await page.getByRole('button',{name:'Tiếp tục rút tiền',exact:true}).click();
  await page.getByRole('button',{name:'Dùng tài khoản thành công',exact:true}).click();
  await page.getByRole('button',{name:'Xác nhận rút 116.100 ₫',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Rút tiền thành công',exact:true})).toBeVisible();
  const final=await (await request.get(`${f.api}/commerce/wallet`,{headers:dev})).json();
  expect(final.balance).toBe(before.balance);
});
