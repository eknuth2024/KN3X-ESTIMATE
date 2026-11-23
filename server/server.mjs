import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { openStore, publicUser, verifyPassword, hashPassword, username } from './store.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_AGE = 12 * 60 * 60 * 1000;
const IDLE = 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');
const cookieName = 'kn3x_session';
const publicFiles = new Set(['/login.html','/access.css','/login.js','/logo.PNG','/favicon.ico','/favicon-32.png','/apple-touch-icon.png','/icon-192.png','/icon-512.png','/site.webmanifest']);
const privateFiles = new Set(['/index.html','/account.html','/account.js','/workspace-account.js','/estimate-storage.js']);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.ico':'image/x-icon', '.webmanifest':'application/manifest+json' };

export async function buildServer({ dataDir, root = sourceRoot, origin = 'http://127.0.0.1:3080', secureCookies = origin.startsWith('https:') } = {}) {
  const expectedOrigin = new URL(origin).origin;
  const store = await openStore(dataDir || join(homedir(), '.kn3x-estimate'));
  const sessions = new Map();
  const attempts = new Map();
  const dummyHash = await hashPassword(randomBytes(24).toString('hex'));
  function invalidate(id) { for (const [key, value] of sessions) if (value.userId === id) sessions.delete(key); }
  function cookie(res, token, clear = false) {
    res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : MAX_AGE / 1000}${secureCookies ? '; Secure' : ''}`);
  }
  function session(req) {
    const token = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = digest(token), value = sessions.get(key), now = Date.now();
    if (!value || now > value.expires || now - value.lastSeen > IDLE) { sessions.delete(key); return null; }
    const user = store.byId(value.userId);
    if (!user?.active) { sessions.delete(key); return null; }
    value.lastSeen = now;
    return { key, user };
  }
  function send(res, status, data) {
    res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }
  function redirect(res, target) { res.writeHead(303, { Location:target }); res.end(); }
  async function body(req) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Envía JSON.'), { status:415 });
    let size = 0, chunks = [];
    for await (const part of req) { size += part.length; if (size > 8192) throw Object.assign(new Error('Solicitud demasiado grande.'), { status:413 }); chunks.push(part); }
    let data;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Solicitud inválida.'), { status:400 }); }
    if (!data || Array.isArray(data) || typeof data !== 'object') throw Object.assign(new Error('Solicitud inválida.'), { status:400 });
    return data;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    try {
      const url = new URL(req.url, expectedOrigin), path = url.pathname;
      if (['/login.html','/account.html'].includes(path)) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (req.headers.host !== new URL(expectedOrigin).host) return send(res, 421, { error:'Dirección del servidor no reconocida.' });
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== expectedOrigin) return send(res, 403, { error:'Origen no autorizado.' });
      const auth = session(req);
      if (path === '/api/session' && req.method === 'GET') return send(res, 200, { user:auth ? publicUser(auth.user) : null });
      if (path === '/api/login' && req.method === 'POST') {
        const data = await body(req);
        const ip = req.socket.remoteAddress || 'unknown', now = Date.now();
        for (const [key, value] of attempts) if (now - value.since > 15 * 60 * 1000) attempts.delete(key);
        const rate = attempts.get(ip) || { since:now, count:0 };
        if (rate.count >= 8) return send(res, 429, { error:'Demasiados intentos. Espera 15 minutos.' });
        rate.count++; attempts.set(ip,rate);
        let login;
        try { login = username(data.username); } catch { login = ''; }
        const user = store.byUsername(login);
        const valid = await verifyPassword(data.password, user?.passwordHash || dummyHash);
        if (!valid || !user?.active) return send(res, 401, { error:'Usuario o contraseña incorrectos.' });
        attempts.delete(ip);
        if (auth) sessions.delete(auth.key);
        const token = randomBytes(32).toString('hex');
        sessions.set(digest(token), { userId:user.id, expires:now + MAX_AGE, lastSeen:now });
        cookie(res,token);
        return send(res, 200, { user:publicUser(user) });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        if (auth) sessions.delete(auth.key);
        cookie(res,'',true);
        return send(res,200,{ ok:true });
      }
      if (path.startsWith('/api/')) {
        if (!auth) return send(res,401,{ error:'Inicia sesión para continuar.' });
        if (path === '/api/password' && req.method === 'POST') {
          const data = await body(req);
          if (!await verifyPassword(data.currentPassword,auth.user.passwordHash)) return send(res,400,{ error:'La contraseña actual no coincide.' });
          if (data.currentPassword === data.newPassword) return send(res,400,{ error:'Elige una contraseña diferente.' });
          await store.changePassword(auth.user.id,data.newPassword);
          invalidate(auth.user.id); cookie(res,'',true);
          return send(res,200,{ ok:true });
        }
        if (auth.user.mustChangePassword) return send(res,403,{ error:'Cambia tu contraseña temporal antes de continuar.' });
        if (path === '/api/users' || path.startsWith('/api/users/')) {
          if (auth.user.role !== 'admin') return send(res,403,{ error:'Solo el administrador puede gestionar usuarios.' });
          if (path === '/api/users' && req.method === 'GET') return send(res,200,{ users:store.users().map(publicUser) });
          if (path === '/api/users' && req.method === 'POST') {
            const data = await body(req);
            if ('role' in data || 'admin' in data) return send(res,400,{ error:'Las cuentas nuevas siempre son usuarios normales.' });
            const user = await store.create({ name:data.name, login:data.username, password:data.password });
            return send(res,201,{ user });
          }
          if (path.startsWith('/api/users/') && req.method === 'PATCH') {
            const data = await body(req), id = path.slice('/api/users/'.length);
            if (typeof data.active !== 'boolean' || Object.keys(data).some(k => k !== 'active')) return send(res,400,{ error:'Solo se puede activar o desactivar la cuenta.' });
            const user = await store.setActive(id,data.active);
            invalidate(id);
            return send(res,200,{ user });
          }
        }
        return send(res,404,{ error:'Función no encontrada.' });
      }
      if (!['GET','HEAD'].includes(req.method)) return send(res,405,{ error:'Método no permitido.' });
      const file = path === '/' ? '/index.html' : path;
      if (privateFiles.has(file)) {
        if (!auth) return redirect(res,'/login.html');
        if (auth.user.mustChangePassword && file !== '/account.html' && file !== '/account.js') return redirect(res,'/account.html');
      } else if (!publicFiles.has(file)) return send(res,404,{ error:'Archivo no encontrado.' });
      const content = await readFile(join(root,file.slice(1)));
      const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
      res.writeHead(200,{ 'Content-Type':mime[ext] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      if (error.code === 'ENOENT') return send(res,404,{ error:'Archivo no encontrado.' });
      send(res,error.status || 400,{ error:error.status === 500 ? 'Error del servidor.' : error.message });
    }
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key,value] of sessions) if (now > value.expires || now - value.lastSeen > IDLE) sessions.delete(key);
  },60000);
  cleanup.unref(); server.on('close',() => clearInterval(cleanup));
  return { server, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3080);
  const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  if (!['127.0.0.1','localhost','::1'].includes(host) && !origin.startsWith('https://') && process.env.ALLOW_INSECURE_LAN !== 'true') {
    throw new Error('Configura PUBLIC_ORIGIN con HTTPS para acceso remoto. Para una prueba solo en tu red local, ALLOW_INSECURE_LAN=true.');
  }
  const { server } = await buildServer({ dataDir:process.env.DATA_DIR, origin });
  server.listen(port,host,() => console.log(`KN3X Estimate: ${origin}\nUsuarios privados fuera del repositorio. Ctrl+C para detener.`));
}
