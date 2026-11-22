// The public/static tool remains available until its private server is activated.
// Access controls are enforced by the server, never by this visibility check.
(async () => {
  const link = document.getElementById('workspace-account-link');
  if (!link) return;
  try {
    const response = await fetch('/api/session', { credentials:'same-origin', cache:'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
    const { user } = await response.json();
    if (!user) { location.replace('/login.html'); return; }
    if (user.mustChangePassword) { location.replace('/account.html'); return; }
    link.href = 'account.html';
    link.textContent = 'Usuario';
    const mobileLink = document.getElementById('mobile-account-link');
    if (mobileLink) mobileLink.href = 'account.html';
    const label = document.getElementById('workspace-account-user');
    label.textContent = user.name;
    label.hidden = false;
    // A browser may show a cached workspace on Back after logout; check again.
    window.addEventListener('pageshow', async event => {
      if (!event.persisted) return;
      try { const check = await fetch('/api/session', { cache:'no-store' }); const data = await check.json(); if (!data.user) location.replace('/login.html'); }
      catch { location.replace('/login.html'); }
    });
  } catch { /* A static host has no account API. */ }
})();
