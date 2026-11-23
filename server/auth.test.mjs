import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { buildServer } from './server.mjs';

test('private access, member permissions, password change, suspension and persistence', async t => {
  const directory = await mkdtemp(join(tmpdir(),'kn3x-auth-test-'));
  const origin = 'http://127.0.0.1:3080';
  await writeFile(join(directory,'index.html'),'<h1>Private workspace</h1>');
  await writeFile(join(directory,'estimate-storage.js'),'// estimate storage');
  await writeFile(join(directory,'login.html'),'<h1>Login</h1>');
  await writeFile(join(directory,'account.html'),'<h1>Account</h1>');
  const app = await buildServer({ dataDir:directory,root:directory,origin });
  app.server.listen(0,'127.0.0.1'); await once(app.server,'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); await rm(directory,{ recursive:true,force:true }); });
  async function request(path,{ method='GET',data,cookie,requestOrigin=origin,host='127.0.0.1:3080' } = {}) {
    return new Promise((resolve,reject) => {
      const req = httpRequest(base + path,{ method,headers:{ Host:host,Origin:requestOrigin,'Content-Type':'application/json',...(cookie ? { Cookie:cookie } : {}) } },res => {
        const chunks = [];
        res.on('data',part => chunks.push(part));
        res.on('end',() => resolve(new Response(Buffer.concat(chunks),{ status:res.statusCode,headers:res.headers })));
      });
      req.on('error',reject); req.end(data === undefined ? undefined : JSON.stringify(data));
    });
  }
  const adminPassword = 'owner-test-password-123';
  await app.store.create({ name:'Owner',login:'owner',password:adminPassword,admin:true });
  assert.equal((await request('/')).status,303);
  assert.equal((await request('/index.html')).headers.get('location'),'/login.html');
  assert.equal((await request('/account.html')).status,303);
  assert.equal((await request('/estimate-storage.js')).headers.get('location'),'/login.html');
  assert.equal((await request('/server/store.mjs')).status,404);
  assert.equal((await request('/users.json')).status,404);
  assert.equal((await request('/api/users')).status,401);
  assert.equal((await request('/api/login',{ method:'POST',requestOrigin:'https://evil.example',data:{ username:'owner',password:adminPassword } })).status,403);
  assert.equal((await request('/api/session',{ host:'evil.example' })).status,421);
  assert.equal((await request('/api/login',{ method:'POST',data:{ username:'owner',password:'wrong' } })).status,401);
  const login = await request('/api/login',{ method:'POST',data:{ username:'OWNER',password:adminPassword } });
  assert.equal(login.status,200);
  const setCookie = login.headers.get('set-cookie'), adminCookie = setCookie.split(';')[0];
  assert.match(setCookie,/HttpOnly/); assert.match(setCookie,/SameSite=Strict/);
  assert.equal((await request('/',{ cookie:adminCookie })).status,200);
  assert.equal(await (await request('/estimate-storage.js',{ cookie:adminCookie })).text(),'// estimate storage');
  assert.equal((await request('/api/users',{ method:'POST',cookie:adminCookie,data:{ name:'Helper',username:'helper',password:'temporary-test-123',role:'admin' } })).status,400);
  const create = await request('/api/users',{ method:'POST',cookie:adminCookie,data:{ name:'Helper',username:'helper',password:'temporary-test-123' } });
  assert.equal(create.status,201);
  const member = (await create.json()).user;
  assert.equal(member.role,'member'); assert.equal(member.passwordHash,undefined);
  const duplicate = await request('/api/users',{ method:'POST',cookie:adminCookie,data:{ name:'Helper',username:'HELPER',password:'temporary-test-123' } });
  assert.equal(duplicate.status,400);
  const memberLogin = await request('/api/login',{ method:'POST',data:{ username:'helper',password:'temporary-test-123' } });
  let memberCookie = memberLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/',{ cookie:memberCookie })).headers.get('location'),'/account.html');
  assert.equal((await request('/account.html',{ cookie:memberCookie })).status,200);
  assert.equal((await request('/api/users',{ cookie:memberCookie })).status,403);
  const change = await request('/api/password',{ method:'POST',cookie:memberCookie,data:{ currentPassword:'temporary-test-123',newPassword:'private-member-password-123' } });
  assert.equal(change.status,200);
  assert.equal((await request('/api/session',{ cookie:memberCookie })).status,200);
  assert.equal((await (await request('/api/session',{ cookie:memberCookie })).json()).user,null);
  const again = await request('/api/login',{ method:'POST',data:{ username:'helper',password:'private-member-password-123' } });
  memberCookie = again.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/',{ cookie:memberCookie })).status,200);
  for (const method of ['GET','POST','PATCH']) {
    assert.equal((await request(method === 'PATCH' ? `/api/users/${member.id}` : '/api/users',{ method,cookie:memberCookie,...(method === 'GET' ? {} : { data:{ name:'Intruder',username:'intruder',password:'intruder-password-123',active:true } }) })).status,403);
  }
  assert.equal((await request(`/api/users/${member.id}`,{ method:'PATCH',cookie:adminCookie,data:{ active:false } })).status,200);
  assert.equal((await (await request('/api/session',{ cookie:memberCookie })).json()).user,null);
  assert.equal((await request('/api/login',{ method:'POST',data:{ username:'helper',password:'private-member-password-123' } })).status,401);
  const users = (await (await request('/api/users',{ cookie:adminCookie })).json()).users;
  assert.equal(users.length,2); assert.ok(users.every(u => !('passwordHash' in u)));
  const admin = users.find(u => u.role === 'admin');
  assert.equal((await request(`/api/users/${admin.id}`,{ method:'PATCH',cookie:adminCookie,data:{ active:false } })).status,400);
  const disk = await readFile(join(directory,'users.json'),'utf8');
  assert.ok(!disk.includes(adminPassword)); assert.ok(!disk.includes('private-member-password-123')); assert.match(disk,/scrypt:/);
  const reopened = await buildServer({ dataDir:directory,root:directory,origin });
  assert.equal(reopened.store.users().length,2); assert.equal(reopened.store.byId(member.id).active,false);
  reopened.server.emit('close');
  const logout = await request('/api/logout',{ method:'POST',cookie:adminCookie,data:{} });
  assert.equal(logout.status,200); assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await request('/',{ cookie:adminCookie })).status,303);
  // One failed login for the suspended member already counts toward this IP's limit.
  for (let n=0;n<7;n++) assert.equal((await request('/api/login',{ method:'POST',data:{ username:'owner',password:'wrong' } })).status,401);
  assert.equal((await request('/api/login',{ method:'POST',data:{ username:'owner',password:adminPassword } })).status,429);
});
