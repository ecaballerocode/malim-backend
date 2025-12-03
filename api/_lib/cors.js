export function setCORS(req, res) {
  const allowed = [
    "https://ecaballerocode.github.io",
    "https://ecaballerocode.github.io/malim-app",
    "http://localhost:3000",
    "http://localhost:5173",
    "https://malim-app.vercel.app",
    "https://ecaballerocode.github.io/borrar-productos",
    process.env.CODESPACES_ORIGIN,
  ].filter(Boolean);

  const origin = req.headers.origin || "";
  const isAllowed = allowed.some(a => origin.startsWith(a));

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // Permitir todos los métodos y headers
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  // Para que funcione en navegadores modernos
  res.setHeader("Access-Control-Max-Age", "86400"); // 24 horas
}

export function handlePreflight(req, res) {
  setCORS(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}