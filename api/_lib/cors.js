// api/_lib/cors.js
export function setCORS(req, res) {
  const allowed = [
    "https://ecaballerocode.github.io",
    "https://ecaballerocode.github.io/malim-app",
    "http://localhost:3000",
    process.env.CODESPACES_ORIGIN, // opcional: tu URL de Codespaces
  ].filter(Boolean);

  const origin = req.headers.origin || "";
  const isAllowed = allowed.some(a => origin.startsWith(a));
  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
