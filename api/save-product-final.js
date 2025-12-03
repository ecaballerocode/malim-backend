// api/save-product-final.js

import admin from "firebase-admin";
import { setCORS, handlePreflight } from "./_lib/cors.js"; // Importa helpers de CORS

// --- CONFIGURACIÓN DE FIREBASE ADMIN (Usar la misma lógica que en upload.js) ---
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        if (typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.includes('\\n')) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Error inicializando Firebase Admin:", e);
    }
}
const db = admin.firestore();

export default async function handler(req, res) {
    setCORS(req, res);
    if (handlePreflight(req, res)) {
        return;
    }

    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method not allowed" });
    }

    if (req.headers['content-type'] !== 'application/json') {
        return res.status(400).json({ success: false, error: "Content-Type must be application/json" });
    }
    
    try {
        const productData = req.body;
        
        if (!productData || !productData.productSku) {
            return res.status(400).json({ success: false, error: "Invalid product data or missing productSku." });
        }
        
        // Guardar/Actualizar el documento en Firestore
        await db.collection("productos").doc(productData.productSku).set(productData, { merge: true });

        res.status(200).json({ 
            success: true, 
            message: `Producto ${productData.productSku} guardado/actualizado exitosamente en Firestore.` 
        });

    } catch (err) {
        console.error("Error guardando producto en Firestore:", err);
        res.status(500).json({ success: false, error: "Error interno al guardar en la base de datos." });
    }
}