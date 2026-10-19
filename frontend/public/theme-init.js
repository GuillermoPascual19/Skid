// Tema elegido (ver src/shared/theme.ts) antes de pintar, para que no parpadee.
// Va en un archivo aparte (y no en línea en index.html) para que la CSP no tenga que permitir scripts en línea.
try {
  var theme = JSON.parse(localStorage.getItem('skid.theme.v1'));
  if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
} catch {}
