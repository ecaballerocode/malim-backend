// api/deleteImage.js
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js";
import { setCORS, handlePreflight } from "./_lib/cors.js";

// Función para extraer la key correctamente de diferentes formatos de URL de R2
function extractR2Key(url) {
  try {
    const urlObj = new URL(url);
    
    // Para URLs de R2 públicas (r2.dev)
    if (url.includes('.r2.dev')) {
      // Formato: https://bucket-name.r2.dev/folder/image.jpg
      // La key es todo después del hostname
      let key = urlObj.pathname;
      if (key.startsWith('/')) {
        key = key.substring(1);
      }
      return key;
    }
    
    // Para URLs de R2 con custom domain o otros formatos
    // Si la URL contiene el bucket name en el path
    if (urlObj.pathname.includes('/')) {
      // Asumimos que la key es todo después del primer slash
      const parts = urlObj.pathname.split('/');
      if (parts.length > 1) {
        return parts.slice(1).join('/');
      }
    }
    
    // Si no podemos determinar, devolvemos el pathname completo sin el slash inicial
    return urlObj.pathname.replace(/^\//, '');
    
  } catch (error) {
    console.error("Error parsing URL:", url, error);
    throw new Error("URL inválida");
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

    // Verificamos si es de Cloudflare R2
    if (url.includes("r2.dev") || url.includes("pub-")) {
      const key = extractR2Key(url);
      console.log("Key extraída:", key);
      console.log("Bucket:", process.env.R2_BUCKET);

      if (!key) {
        return res.status(400).json({ 
          success: false, 
          error: "No se pudo extraer la key de la URL" 
        });
      }

      // Verificar que la key no esté vacía
      if (key.trim() === '') {
        return res.status(400).json({ 
          success: false, 
          error: "Key vacía" 
        });
      }

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
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Error interno del servidor" 
    });
  }
}