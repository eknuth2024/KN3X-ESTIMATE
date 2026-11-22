import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const scrypt = promisify(scryptCallback);
export function username(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(value)) throw new Error('Usa un usuario de 3 a 64 letras, números, puntos o guiones.');
  return value.toLowerCase();
}
export function validPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
}
export async function hashPassword(password) {
  validPassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [kind, salt, hex] = String(encoded).split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex)) return false;
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hex, 'hex'));
}
export function publicUser(user) {
  return { id:user.id, username:user.username, name:user.name, role:user.role, active:user.active, mustChangePassword:user.mustChangePassword, createdAt:user.createdAt };
}
export async function openStore(directory) {
  await mkdir(directory, { recursive:true, mode:0o700 });
  const path = join(directory, 'users.json');
  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { version:1, users:[] }; }
  if (state.version !== 1 || !Array.isArray(state.users)) throw new Error('Archivo de usuarios inválido; no se sobrescribió.');
  let queue = Promise.resolve();
  async function transaction(operation) {
    const next = queue.then(async () => {
      const draft = structuredClone(state);
      const result = await operation(draft);
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(draft, null, 2), { mode:0o600, flag:'wx' });
      await rename(temporary, path);
      state = draft;
      return result;
    });
    queue = next.catch(() => {});
    return next;
  }
  return {
    users: () => structuredClone(state.users),
    byId: id => structuredClone(state.users.find(u => u.id === id)),
    byUsername: name => structuredClone(state.users.find(u => u.username === name)),
    async create({ name, login, password, admin = false }) {
      const normalized = username(login);
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw new Error('Escribe un nombre de hasta 100 caracteres.');
      const passwordHash = await hashPassword(password);
      return transaction(draft => {
        if (admin && draft.users.length) throw new Error('Ya existe el administrador. Los usuarios adicionales se crean dentro de la aplicación.');
        if (draft.users.some(u => u.username === normalized)) throw new Error('Ese usuario ya existe.');
        const user = { id:randomUUID(), username:normalized, name:name.trim(), role:admin ? 'admin' : 'member', active:true, passwordHash, mustChangePassword:!admin, createdAt:new Date().toISOString() };
        draft.users.push(user);
        return publicUser(user);
      });
    },
    async changePassword(id, password) {
      const passwordHash = await hashPassword(password);
      return transaction(draft => {
        const user = draft.users.find(u => u.id === id);
        if (!user) throw new Error('Usuario no encontrado.');
        user.passwordHash = passwordHash;
        user.mustChangePassword = false;
        return publicUser(user);
      });
    },
    async setActive(id, active) {
      return transaction(draft => {
        const user = draft.users.find(u => u.id === id);
        if (!user || user.role !== 'member') throw new Error('Solo se puede cambiar el acceso de usuarios normales.');
        user.active = active;
        return publicUser(user);
      });
    }
  };
}
