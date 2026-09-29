// Applies the saved theme before first paint to avoid a light flash in dark mode.
// Loaded as a blocking classic script in <head>; the toggle itself lives in theme.js.
try {
  const theme = JSON.parse(localStorage.getItem('lk.theme'));
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage is unavailable; the page follows the system theme.
}
