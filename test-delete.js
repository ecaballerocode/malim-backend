import fetch from "node-fetch";

const BACKEND_URL = "http://malim-backend.vercel.app"; // o la URL que te da Codespaces
const key = "malim-1759274212651-7oU06fqI-malim-1759274212747-0-0-malim-1759195445452-d50f2xm9b-malim-175919544877-0-1-image_15_watermarked.jpeg"; // ejemplo: "malim-bucket/malim-123.png"

(async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/deleteImage?key=${encodeURIComponent(key)}`, {
      method: "DELETE"
    });
    const data = await res.text();
    console.log("Respuesta:", res.status, data);
  } catch (err) {
    console.error("Error en prueba:", err);
  }
})();
