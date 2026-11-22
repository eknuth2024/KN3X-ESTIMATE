const form = document.getElementById('login-form');
const status = document.getElementById('login-status');
const submit = document.getElementById('login-submit');
let available = false;
async function inspectSession() {
  try {
    const response = await fetch('/api/session', { credentials:'same-origin', cache:'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
    const data = await response.json(); available = true;
    if (data.user) location.replace(data.user.mustChangePassword ? '/account.html' : '/');
  } catch {
    status.textContent = 'El acceso privado necesita el servidor de la NUC. Abre esta pantalla desde la dirección de ese servidor; GitHub Pages no puede validar usuarios.';
    submit.disabled = true;
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!available) return;
  status.textContent = ''; submit.disabled = true;
  try {
    const response = await fetch('/api/login', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ username:form.username.value.trim(), password:form.password.value }) });
    const data = await response.json();
    form.password.value = '';
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
    location.replace(data.user.mustChangePassword ? '/account.html' : '/');
  } catch (error) { status.textContent = error.message || 'No se pudo conectar con el servidor.'; }
  finally { submit.disabled = false; }
});
inspectSession();
