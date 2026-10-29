/* Kept in sync with the inline bootstrap in index.html. Prefer the inline script. */
(function () {
  try {
    var raw = localStorage.getItem('reamarc-theme');
    var p = raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
    var dark =
      p === 'dark' ||
      ((p === null || p === 'system') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var theme = dark ? 'dark' : 'light';
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    if (document.body) {
      document.body.classList.remove('light', 'dark');
      document.body.classList.add(theme);
    }
  } catch (e) {}
})();
