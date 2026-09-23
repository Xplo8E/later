try {
  const stored = localStorage.getItem('later.theme');
  const theme = ['system', 'light', 'sand', 'mist', 'dark', 'dusk', 'cocoa'].includes(stored) ? stored : 'system';
  document.documentElement.dataset.theme = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  const colors = { light: '#f7f6f2', sand: '#f4e5be', mist: '#deeee2', dark: '#111414', dusk: '#111d34', cocoa: '#2a1b14' };
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[document.documentElement.dataset.theme] || '#111414');
} catch {
  document.documentElement.dataset.theme = 'light';
}
