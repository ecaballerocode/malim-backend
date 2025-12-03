// runtime: nodejs18.x
// NOTA: Este endpoint SÓLO maneja la subida de archivos a Cloudflare R2 y devuelve sus URLs y claves.

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js"; // Asume que s3.js define el cliente R2
import { setCORS, handlePreflight } from "./_lib/cors.js";
import formidable from "formidable";
import fs from "node:fs/promises";
// import admin from "firebase-admin"; // <--- ELIMINADO: Ya no guardamos en Firestore aquí.

// Exportamos esta configuración para Vercel Serverless Functions
export const config = {
    api: {
        bodyParser: false, // Deshabilitar bodyParser para manejar la carga de archivos
    },
};

export default async function handler(req, res) {
    setCORS(req, res);
    if (handlePreflight(req, res)) {
        return;
    }

    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    try {
        const form = formidable({ 
            // 4MB por archivo para evitar fallos de memoria, el frontend sube en lotes de 2
            maxFileSize: 4 * 1024 * 1024, 
            allowEmptyFiles: false 
        });

        const [fields, files] = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) return reject(err);
                resolve([fields, files]);
            });
        });

        // 1. Recopilar todos los archivos (formidable los agrupa en 'files')
        let allFiles = [];
        if (files.files) {
            // Manejar un solo archivo o múltiples archivos
            allFiles = Array.isArray(files.files) ? files.files : [files.files];
        }

        if (allFiles.length === 0) {
            return res.status(400).json({ success: false, error: "No files found in the request." });
        }
        
        const BUCKET_NAME = process.env.R2_BUCKET_NAME;
        
        if (!BUCKET_NAME) {
             throw new Error("La variable R2_BUCKET_NAME no está configurada.");
        }

        const uploadPromises = [];
        const uploadedResults = [];
        const errors = [];
        
        // 2. Procesar cada archivo individualmente para subir a R2
        for (const file of allFiles) {
            const tempPath = file.filepath;
            const r2Key = file.originalFilename; // La clave R2 viene del nombre del campo en FormData (Frontend)

            if (!r2Key) {
                 errors.push(`Archivo omitido: Missing R2 Key para archivo temporal en ${tempPath}`);
                 continue;
            }
            
            try {
                const fileBuffer = await fs.readFile(tempPath);
                
                const command = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: r2Key, // Usamos la clave definida por el frontend
                    Body: fileBuffer,
                    ContentType: file.mimetype || 'application/octet-stream',
                    // Configuración para que el objeto sea público (opcional, depende de tu setup)
                    ACL: 'public-read', 
                });

                await s3.send(command);
                
                // Construye la URL pública para devolver al frontend
                const publicUrl = `https://${process.env.R2_CUSTOM_DOMAIN}/${r2Key}`; 
                
                uploadedResults.push({
                    url: publicUrl,
                    key: r2Key,
                });

            } catch (r2Err) {
                console.error(`Error subiendo ${r2Key} a R2:`, r2Err);
                errors.push(`Fallo al subir ${r2Key}. Error: ${r2Err.message}`);
            } finally {
                // Eliminar el archivo temporal
                await fs.unlink(tempPath).catch(e => console.error("Error al eliminar archivo temporal:", e));
            }
        }

        // 3. Devolver el resultado (SÓLO R2)
        if (uploadedResults.length === 0) {
             return res.status(500).json({ 
                success: false, 
                error: "Ningún archivo pudo ser subido a R2.",
                warnings: errors 
            });
        }
        
        // Devolvemos el array de URLs y el array de R2 keys (ImageIds)
        res.status(200).json({
            success: true,
            urls: uploadedResults.map(r => r.url),
            r2Keys: uploadedResults.map(r => r.key),
            message: `Subidos ${uploadedResults.length} de ${allFiles.length} archivos a R2.`,
            ...(errors.length > 0 && { warnings: errors }),
        });

    } catch (err) {
        console.error("Error en handler:", err);
        // Manejo de errores de Formidable (ej: tamaño de archivo)
        const errorMessage = err.message && err.message.includes('maxFileSize') 
            ? "El tamaño de uno o más archivos excede el límite permitido (4MB por archivo)." 
            : err.message || "Error interno del servidor.";
            
        res.status(500).json({ success: false, error: errorMessage });
    }
}