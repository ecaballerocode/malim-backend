// /api/product-preview.js  (Versión corregida: og:url apunta a la SPA)
export default async (req, res) => {
  // Solo desestructuramos los parámetros que usaremos directamente en el HTML
  const { name, desc, image, spa_url } = req.query; 

  const FALLBACK_DOMAIN = 'https://malim-shop.vercel.app/';
  const isInvalid = !name || !image || !spa_url || name.trim() === "" || image.trim() === "" || spa_url.trim() === "";

  if (isInvalid) {
    res.setHeader('Location', FALLBACK_DOMAIN);
    res.status(302).end();
    return;
  }

  // Normalize values (evitar inyección de HTML)
  const title = String(name);
  const description = String(desc || 'Consulta los detalles de este increíble artículo de nuestra tienda.');
  const imageUrl = String(image);
  const spaUrl = String(spa_url);
  
  // ✅ CLAVE CORREGIDA: Usamos la URL de la SPA para og:url, como en el código viejo.
  const ogUrl = spaUrl; 

  // Lista simple de user-agents de crawlers
  const crawlerUserAgents = [
    'facebookexternalhit', 'Facebot', 'Twitterbot', 'Slackbot', 'WhatsApp', 'LinkedInBot', 'telegrambot'
  ];
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isCrawler = crawlerUserAgents.some((s) => ua.includes(s.toLowerCase()));

  // Headers recomendados
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');

  // HTML con OG tags (para crawlers)
  const htmlWithOG = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>

  <meta property="og:site_name" content="Malim" />
  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  
  <meta property="og:url" content="${escapeHtml(ogUrl)}" />
  
  <link rel="canonical" href="${escapeHtml(spaUrl)}" />

  <meta property="og:image:alt" content="${escapeHtml(title)}" />
  <meta name="twitter:card" content="summary_large_image" />
</head>
<body>
  <main style="font-family: system-ui, sans-serif; padding: 32px; text-align:center;">
    <h1>Cargando producto…</h1>
    <p>Si no eres un bot, haz clic para ver el producto:</p>
    <p><a href="${escapeHtml(spaUrl)}">${escapeHtml(spaUrl)}</a></p>
  </main>
  <script>
    // Si es un navegador humano, redirigimos pasados 400ms 
    setTimeout(()=>{ window.location.replace("${escapeForJs(spaUrl)}"); }, 400);
  </script>
</body>
</html>`;

  if (isCrawler) {
    // DEVOLVEMOS 200 con OG tags para crawlers (sin redirect)
    res.setHeader('Content-Location', spaUrl);
    res.setHeader('Link', `<${spaUrl}>; rel="canonical"`);
    res.status(200).send(htmlWithOG);
  } else {
    // Para navegadores normales: redirección 302 al SPA
    res.setHeader('Location', spaUrl);
    res.status(302).end();
  }
};

// helpers simples para escapar
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeForJs(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');
}