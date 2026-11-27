// The sign-in window lands here: hand the answer to the app (same site, through localStorage) and close.
// A sign-in that opened in its own window closes itself (Dropbox may cut the link to the app's window, so window.opener
// can be empty): it never loads a second copy of the app. A sign-in in the same window goes back to the app.
'use strict';
(function () {
  let q = null; try { q = JSON.parse(localStorage.getItem('b4a.oauthReq') || 'null'); } catch (_) { /* ignore */ }
  try { localStorage.setItem('b4a.oauthRes', JSON.stringify({ hash: location.hash, search: location.search, t: Date.now() })); } catch (_) { /* ignore */ }
  history.replaceState(null, '', location.pathname); // the token does not stay in the address bar or history
  const m = document.getElementById('m');
  if (!(q && q.win === 'popup')) { m.textContent = 'החיבור הושלם. חוזרים לאפליקציה…'; location.replace('./'); return; }
  m.textContent = 'החיבור הושלם ✓ אפשר לסגור את החלון הזה ולחזור לאפליקציה.';
  try { window.close(); } catch (_) { /* ignore */ }
})();
