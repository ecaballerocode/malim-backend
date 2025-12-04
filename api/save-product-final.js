// api/save-product-final.js

import admin from "firebase-admin";
// Asegúrate de que este archivo cors.js exista y contenga las funciones setCORS y handlePreflight
import { setCORS, handlePreflight } from "./_lib/cors.js"; 

// --- CONFIGURACIÓN ROBUSTA DE FIREBASE ADMIN (Usando variables separadas) ---
if (!admin.apps.length) {
    try {
        // Obtener las variables de entorno separadas
        const privateKeyString = process.env.FIREBASE_PRIVATE_KEY;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const projectId = process.env.FIREBASE_PROJECT_ID;

        if (!privateKeyString || !clientEmail || !projectId) {
             throw new Error("Faltan variables de entorno de Firebase esenciales (PRIVATE_KEY, CLIENT_EMAIL, PROJECT_ID).");
        }
        
        // CORRECCIÓN CLAVE: Limpiar la llave privada de los escapes introducidos por Vercel.
        // Esto asegura que la llave sea multilínea, lo cual es necesario para la autenticación.
        const cleanedPrivateKey = privateKeyString
            .replace(/\\n/g, '\n') 
            .replace(/\\\\n/g, '\n'); 

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: projectId,
                clientEmail: clientEmail,
                privateKey: cleanedPrivateKey,
            })
        });
        
        console.log("✅ Firebase Admin inicializado correctamente con variables separadas.");

    } catch (e) {
        console.error("🚨 Error crítico al inicializar Firebase. Revise el formato de FIREBASE_PRIVATE_KEY:", e.message);
        throw e;
    }
}

// Inicialización de Firestore
const db = admin.firestore();

// --------------------------------------------------------------------------
// --- HANDLER PRINCIPAL (Con corrección de CORS) ---
// --------------------------------------------------------------------------
export default async function handler(req, res) {
    
    // Manejo de CORS (Preflight)
    if (req.method === 'OPTIONS') {
        // Asegúrate de que handlePreflight acepte (req, res)
        handlePreflight(req, res); 
        return;
    }
    
    // CORS para la petición principal (GET/POST/etc.)
    // CORRECCIÓN: Asegúrate de pasar 'req' a setCORS para que pueda leer la cabecera 'Origin'
    setCORS(req, res); 

    try {
        const productData = req.body;
        
        if (!productData || !productData.productSku) {
            return res.status(400).json({ success: false, error: "Datos de producto inválidos o falta productSku." });
        }
        
        // Guardar/Actualizar el documento en Firestore
        await db.collection("productos").doc(productData.productSku).set(productData, { merge: true });

        res.status(200).json({ 
            success: true, 
            message: `Producto ${productData.productSku} guardado/actualizado exitosamente en Firestore.` 
        });

    } catch (err) {
        // Si ves un error aquí, ya no será de UNAUTHENTICATED, sino de la DB o código.
        console.error("🔴 Error guardando producto en Firestore:", err);
        res.status(500).json({ success: false, error: "Error interno al guardar en la base de datos." });
    }
}