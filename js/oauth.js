// The sign-in window lands here: hand the answer to the app (same site, through localStorage) and close.
'use strict';
(function () {
  try { localStorage.setItem('b4a.oauthRes', JSON.stringify({ hash: location.hash, search: location.search, t: Date.now() })); } catch (_) { /* ignore */ }
  history.replaceState(null, '', location.pathname); // the token does not stay in the address bar or history
  document.getElementById('m').textContent = 'החיבור הושלם. אפשר לחזור לאפליקציה.';
  if (window.opener) { try { window.close(); } catch (_) { /* ignore */ } }
  setTimeout(() => { if (!window.closed) location.replace('./'); }, 600); // opened in the same window: back to the app
})();
