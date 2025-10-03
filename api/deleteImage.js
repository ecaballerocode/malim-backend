// api/deleteImage.js
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js";
import { setCORS, handlePreflight } from "./_lib/cors.js";

// Función para extraer la key desde una URL de R2
function extractR2Key(url) {
  try {
    const urlObj = new URL(url);
    let key = urlObj.pathname.startsWith("/") ? urlObj.pathname.slice(1) : urlObj.pathname;
    return decodeURIComponent(key);
  } catch (error) {
    console.error("Error parsing URL:", url, error);
    throw new Error("URL inválida: " + url);
  }
}

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
    const decodedUrl = decodeURIComponent(url.trim());

    // Verificamos si es de Cloudflare R2
    if (decodedUrl.includes("r2.dev") || decodedUrl.includes("pub-")) {
      const key = extractR2Key(decodedUrl);
      console.log("Key extraída:", key);
      console.log("Bucket:", process.env.R2_BUCKET);

      if (!key || key.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          error: "No se pudo extraer una key válida de la URL" 
        });
      }

      // Verificar que el bucket esté configurado
      if (!process.env.R2_BUCKET) {
        return res.status(500).json({ 
          success: false, 
          error: "Configuración del bucket R2 no encontrada" 
        });
      }

      // Eliminar objeto de R2
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      }));

      console.log("Imagen eliminada correctamente de R2:", key);
      return res.status(200).json({ 
        success: true, 
        message: "Imagen eliminada de R2 correctamente",
        key: key
      });
    }

    // Si no es R2, devolvemos éxito pero indicamos que no se hizo nada
    return res.status(200).json({ 
      success: true, 
      message: "URL no es de R2, no se requiere eliminación" 
    });

  } catch (error) {
    console.error("Error en deleteImage:", error);
    
    // Error específico de S3
    if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
      return res.status(404).json({ 
        success: false, 
        error: "La imagen no fue encontrada en R2" 
      });
    }
    
    if (error.name === 'AccessDenied') {
      return res.status(403).json({ 
        success: false, 
        error: "Acceso denegado al bucket R2" 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Error interno del servidor" 
    });
  }
}