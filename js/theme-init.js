/* Set the saved theme before CSS paints, including on directly opened pages. */
(function () {
  var theme = 'light';
  try { if (localStorage.getItem('minghz.theme') === 'dark') theme = 'dark'; } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme);
})();
