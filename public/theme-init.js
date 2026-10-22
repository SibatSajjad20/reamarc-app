(function () {
  try {
    var p = localStorage.getItem('reamarc-theme') || 'system';
    var dark = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    var c = document.documentElement.classList;
    c.remove('light', 'dark');
    c.add(dark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
