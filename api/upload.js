// runtime: nodejs18.x
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js";
import { setCORS, handlePreflight } from "./_lib/cors.js";
import formidable from "formidable";
import fs from "node:fs/promises";
import admin from "firebase-admin";

// --- INICIALIZACIÓN DE FIREBASE ADMIN (CORREGIDA) ---
// Ahora lee la variable de entorno FIREBASE_SERVICE_ACCOUNT
if (!admin.apps.length) {
    try {
        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
             throw new Error("La variable FIREBASE_SERVICE_ACCOUNT no está configurada.");
        }
        
        // Parseamos el JSON completo que está en la variable de entorno
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // Ajuste de seguridad: El JSON de Vercel debe ser parseado, 
        // y a veces el private_key necesita un reemplazo de escapes.
        // Aunque la mayoría de los runtimes lo manejan, es una capa extra de seguridad.
        if (typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.includes('\\n')) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin inicializado correctamente.");
        
    } catch (e) {
        console.error("Error al inicializar Firebase Admin:", e);
        // Si no se inicializa, se lanzará un error 500 más adelante
    }
}

const db = admin.firestore();

// NOTA: El límite de Vercel es de 4.5MB para el payload de la petición.
const form = formidable({
    multiples: true,
    maxFiles: 50, 
    maxFileSize: 4 * 1024 * 1024, // Reducido a 4MB para Vercel
});


export default async function handler(req, res) {
    if (handlePreflight(req, res)) return;
    setCORS(req, res);

    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Método no permitido" });
    }

    // Validación de envs (Asegura que todas las variables necesarias existan)
    const requiredVars = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET", "R2_DEV_URL", "FIREBASE_SERVICE_ACCOUNT"];
    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length) {
        return res.status(500).json({ success: false, error: "Variables de entorno incompletas", missing });
    }
    
    // Validación de la inicialización de Firebase Admin
    if (!admin.apps.length) {
         return res.status(500).json({ success: false, error: "Error de configuración de Firebase Admin" });
    }

    try {
        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    console.error("Error de Formidable:", err);
                    return reject(err);
                }
                resolve({ fields, files });
            });
        });

        // 1. Obtener archivos y productData
        const uploadedFiles = files.files;
        const allFiles = Array.isArray(uploadedFiles) ? uploadedFiles : (uploadedFiles ? [uploadedFiles] : []);
        
        let productData;
        try {
            const productDataStr = Array.isArray(fields.productData) ? fields.productData[0] : fields.productData;
            productData = JSON.parse(productDataStr);
        } catch (e) {
            return res.status(400).json({ success: false, error: "Datos de producto (productData) inválidos o faltantes" });
        }

        if (!productData || !productData.productSku || !productData.variants) {
            return res.status(400).json({ success: false, error: "productSku o variantes faltantes en productData" });
        }
        
        // Si no hay archivos, al menos guardar los datos en Firestore y terminar
        if (!allFiles.length) {
            await db.collection("productos").doc(productData.productSku).set(productData, { merge: true });
            return res.status(200).json({ success: true, urls: [], message: "No hay archivos. Datos de producto guardados en Firestore." });
        }


        // 2. Tareas de Subida a R2
        const uploadTasks = [];
        const errors = [];
        

        for (const file of allFiles) {
            const safeOriginal = (file.originalFilename || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
            const tempKey = `malim-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${safeOriginal}`;
            
            const uploadPromise = async () => {
                // Leer el archivo temporal para subirlo a R2
                try {
                    const body = await fs.readFile(file.filepath);

                    await s3.send(new PutObjectCommand({
                        Bucket: process.env.R2_BUCKET,
                        Key: tempKey, 
                        Body: body,
                        ContentType: file.mimetype || "application/octet-stream",
                    }));

                    // Limpiar el archivo temporal inmediatamente después de subirlo
                    await fs.unlink(file.filepath); 

                    return { 
                        key: tempKey, 
                        url: `${process.env.R2_DEV_URL}/${tempKey}`,
                        originalFilename: file.originalFilename 
                    };
                } catch (e) {
                    errors.push({ file: file.originalFilename, error: e.message });
                    // Asegurar que el archivo temporal se borre incluso si la subida falla
                    try { await fs.unlink(file.filepath); } catch (cleanErr) { console.error("Error al limpiar:", cleanErr); }
                    return null;
                }
            };
            uploadTasks.push(uploadPromise());
        }

        const uploadedResults = (await Promise.all(uploadTasks)).filter(r => r !== null);
        
        // --- 3. Actualización de Firestore ---
        // Guardamos los datos del producto (sin las URLs finales, el frontend debe mapearlas)
        const productToSave = { 
            ...productData,
            variants: productData.variants.map(v => ({
                // Limpiamos la estructura de la variante antes de guardarla
                id: v.id,
                variantSku: v.variantSku,
                colorName: v.colorName,
                hexColor: v.hexColor,
                sizes: v.sizes,
                imageIds: v.imageIds || [], 
                imageUrls: v.imageUrls || [],
            }))
        };
        
        // Guardar o actualizar el documento principal
        await db.collection("productos").doc(productToSave.productSku).set(productToSave, { merge: true });
        

        res.status(200).json({
            success: true,
            urls: uploadedResults.map(r => r.url),
            r2Keys: uploadedResults.map(r => r.key),
            message: `Subidos ${uploadedResults.length} de ${allFiles.length} archivos. Producto guardado/actualizado.`,
            ...(errors.length > 0 && { warnings: errors }),
        });

    } catch (err) {
        console.error("Error en handler:", err);
        // Si el error es debido al payload o formidable, damos un mejor mensaje
        const errorMessage = err.message.includes('maxFileSize') 
            ? "El tamaño del archivo excede el límite permitido (4MB)." 
            : err.message;
            
        res.status(500).json({ success: false, error: errorMessage });
    }
}