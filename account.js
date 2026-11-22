const $ = id => document.getElementById(id);
async function api(path, options = {}) {
  const response = await fetch(path, { credentials:'same-origin', cache:'no-store', ...options, headers:{ 'Content-Type':'application/json', ...options.headers } });
  if (response.status === 401) { location.replace('/login.html'); throw new Error('La sesión terminó.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la acción.');
  return data;
}
async function loadUsers() {
  const { users } = await api('/api/users');
  $('users-list').replaceChildren();
  for (const user of users) {
    const row = document.createElement('div'); row.className = 'user-row';
    const info = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = user.name;
    const detail = document.createElement('p'); detail.className = 'muted';
    detail.textContent = `${user.username} · ${user.role === 'admin' ? 'Administrador' : 'Usuario normal'} · ${user.active ? 'Activo' : 'Suspendido'}${user.mustChangePassword ? ' · Contraseña temporal' : ''}`;
    info.append(name,detail); row.append(info);
    if (user.role !== 'admin') {
      const button = document.createElement('button'); button.type = 'button';
      button.className = user.active ? 'danger' : 'secondary'; button.textContent = user.active ? 'Desactivar acceso' : 'Reactivar acceso';
      button.addEventListener('click', async () => {
        if (user.active && !confirm(`¿Desactivar el acceso de ${user.name}? Se cerrarán sus sesiones.`)) return;
        button.disabled = true; $('users-status').textContent = '';
        try { await api(`/api/users/${encodeURIComponent(user.id)}`, { method:'PATCH', body:JSON.stringify({ active:!user.active }) }); await loadUsers(); }
        catch (error) { $('users-status').textContent = error.message; button.disabled = false; }
      }); row.append(button);
    }
    $('users-list').append(row);
  }
}
$('logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method:'POST', body:'{}' }); location.replace('/login.html'); }
  catch (error) { $('identity').textContent = error.message; }
});
$('password-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button');
  const status = $('password-status'); status.textContent = '';
  if (form.newPassword.value !== form.confirmPassword.value) { status.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
  button.disabled = true;
  try {
    await api('/api/password', { method:'POST', body:JSON.stringify({ currentPassword:form.currentPassword.value, newPassword:form.newPassword.value }) });
    form.reset(); location.replace('/login.html');
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
$('user-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'), status = $('user-status');
  button.disabled = true; status.textContent = ''; status.classList.remove('success');
  try {
    const { user } = await api('/api/users', { method:'POST', body:JSON.stringify({ name:form.displayName.value.trim(), username:form.login.value.trim(), password:form.password.value }) });
    form.reset(); status.classList.add('success'); status.textContent = `Usuario ${user.username} creado. Deberá cambiar su contraseña al entrar.`;
    await loadUsers();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});
async function initialize() {
  try {
    const { user } = await api('/api/session');
    if (!user) { location.replace('/login.html'); return; }
    $('identity').textContent = `${user.name} · ${user.username} · ${user.role === 'admin' ? 'Administrador' : 'Usuario normal'}`;
    $('temporary-note').hidden = !user.mustChangePassword;
    $('workspace-link').hidden = user.mustChangePassword;
    if (user.role === 'admin' && !user.mustChangePassword) {
      $('create-user-panel').hidden = false; $('users-panel').hidden = false; await loadUsers();
    }
  } catch (error) { $('identity').textContent = 'No se pudo conectar con el servidor privado. Abre la aplicación desde la NUC.'; }
}
initialize();
