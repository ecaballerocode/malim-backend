// api/save-product-final.js

import admin from "firebase-admin";
// Asegúrate de que este archivo existe y es necesario, o coméntalo/elimínalo si da problemas.
import { setCORS, handlePreflight } from "./_lib/cors.js"; 

// --- CONFIGURACIÓN DE FIREBASE ADMIN (Versión MÁS robusta para escapes) ---
if (!admin.apps.length) {
    try {
        // 1. Obtener el string de la variable de entorno
        let serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
        
        if (!serviceAccountString) {
            throw new Error("La variable de entorno FIREBASE_SERVICE_ACCOUNT no está definida.");
        }

        // 2. CORRECCIÓN CLAVE: Asegurar que los saltos de línea (\n) son correctos.
        // A. Corrección para el doble escape (\\n en lugar de \n) que a menudo añade Vercel.
        serviceAccountString = serviceAccountString.replace(/\\\\n/g, '\\n');
        
        // B. Corrección adicional para cualquier '\n' que aún pueda ser interpretado
        // como un escape literal por JSON.parse (si el JSON es de una sola línea)
        // Convertimos el string 'literal' \n en el carácter de nueva línea real.
        serviceAccountString = serviceAccountString.replace(/\\n/g, '\n'); 
        
        // 3. Parsea el JSON ya corregido
        const serviceAccount = JSON.parse(serviceAccountString);

        // 4. Inicializa Firebase Admin
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        
    } catch (e) {
        console.error("🚨 Error crítico al inicializar Firebase Admin:", e);
        // Lanzamos un error claro para el log
        // Si este error ocurre, significa que la variable de entorno está mal formada.
        throw new Error("Fallo al inicializar Firebase Admin. Revisar logs detalladamente y la variable FIREBASE_SERVICE_ACCOUNT.");
    }
}

// Inicialización de Firestore
const db = admin.firestore();

// --------------------------------------------------------------------------
// --- HANDLER PRINCIPAL (El resto permanece igual, ya era correcto) ---
// --------------------------------------------------------------------------
export default async function handler(req, res) {
    // Manejo de CORS si es necesario (asumiendo que setCORS y handlePreflight funcionan)
    if (req.method === 'OPTIONS') {
        handlePreflight(res);
        return;
    }
    setCORS(res);
    
    // El resto del código de tu handler
    try {
        const productData = req.body;
        
        if (!productData || !productData.productSku) {
            return res.status(400).json({ success: false, error: "Invalid product data or missing productSku." });
        }
        
        // Guardar/Actualizar el documento en Firestore
        // Si el problema de autenticación se resuelve, esta línea funcionará.
        await db.collection("productos").doc(productData.productSku).set(productData, { merge: true });

        res.status(200).json({ 
            success: true, 
            message: `Producto ${productData.productSku} guardado/actualizado exitosamente en Firestore.` 
        });

    } catch (err) {
        console.error("🔴 Error guardando producto en Firestore:", err);
        // Devolvemos 500 para errores internos (como el de autenticación/base de datos)
        res.status(500).json({ success: false, error: "Error interno al guardar en la base de datos." });
    }
}