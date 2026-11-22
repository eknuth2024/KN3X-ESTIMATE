import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { openStore } from './store.mjs';

let muted = false;
const output = new Writable({ write(chunk,encoding,callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input:process.stdin, output, terminal:!!process.stdin.isTTY });
try {
  const store = await openStore(process.env.DATA_DIR || join(homedir(), '.kn3x-estimate'));
  if (store.users().length) throw new Error('El administrador ya existe. No se modificó ninguna cuenta.');
  const name = await rl.question('Nombre del administrador: ');
  const login = await rl.question('Usuario (sin espacios): ');
  process.stdout.write('Contraseña (mínimo 12 caracteres; no se muestra): '); muted = true;
  const password = await rl.question('');
  muted = false; process.stdout.write('\nConfirma la contraseña: '); muted = true;
  const confirm = await rl.question('');
  muted = false; process.stdout.write('\n');
  if (confirm !== password) throw new Error('Las contraseñas no coinciden.');
  await store.create({ name,login,password,admin:true });
  console.log('Administrador creado. Ya puedes iniciar el servidor con npm start.');
} catch (error) { muted = false; console.error(error.message); process.exitCode = 1; }
finally { rl.close(); }
