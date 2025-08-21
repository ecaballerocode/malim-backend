// api/deleteImage.js
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js"; // 👈 USA el client que ya tienes
import { setCORS, handlePreflight } from "./_lib/cors.js";

export default async function handler(req, res) {
  // Manejar preflight CORS
  if (req.method === 'OPTIONS') {
    return handlePreflight(req, res);
  }
  setCORS(req, res);

  if (req.method !== "DELETE") {
    return res.status(405).json({ success: false, error: "Método no permitido" });
  }

  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "URL válida requerida" });
  }

  try {
    console.log("URL recibida para eliminar:", url);

    // Verificamos si es de Cloudflare R2
    if (url.includes(".r2.dev")) {
      // Extraer la key correctamente
      const urlObj = new URL(url);
      let key = urlObj.pathname;
      
      if (key.startsWith('/')) {
        key = key.substring(1);
      }

      console.log("Key extraída:", key);
      console.log("Bucket:", process.env.R2_BUCKET);

      // 👈 USA el client S3 que ya tienes en _lib/s3.js
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }));

      return res.status(200).json({ 
        success: true, 
        message: "Imagen eliminada de R2 correctamente" 
      });
    }

    // Si no es R2 (es Cloudinary), el frontend se encarga
    return res.status(200).json({ 
      success: true, 
      message: "URL no es de R2, eliminación debe hacerse desde frontend" 
    });

  } catch (error) {
    console.error("Error en deleteImage:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Error interno del servidor" 
    });
  }
}