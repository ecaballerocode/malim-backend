// api/deleteImage.js
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js";
import { setCORS, handlePreflight } from "./_lib/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== "DELETE") {
    return res.status(405).json({ success: false, error: "Método no permitido" });
  }

  const { url } = req.query; // el frontend manda ?url=https://...
  if (!url) {
    return res.status(400).json({ success: false, error: "URL requerida" });
  }

  try {
    // Verificamos si es de Cloudflare R2
    if (url.includes("r2.dev")) {
      const key = url.replace(`${process.env.R2_DEV_URL}/`, "");
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }));
      return res.status(200).json({ success: true, message: "Imagen eliminada de R2" });
    }

    // Si no es R2, solo devolvemos OK (porque Cloudinary se maneja en frontend)
    return res.status(200).json({ success: true, message: "No es R2, no se eliminó en backend" });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
