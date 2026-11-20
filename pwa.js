// Registers the service worker so the app can be installed on the phone and opens offline.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* app still works without it */ });
  });
})();
