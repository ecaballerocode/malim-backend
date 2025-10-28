// /api/generate-collage.js (Versión robustecida con Decodificación de URL y Fallback 302)
import { createCanvas, loadImage } from 'canvas';
import { URLSearchParams } from 'url';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const FALLBACK_IMAGE_URL = 'https://malim-shop.vercel.app/placeholder.jpg';

export default async (req, res) => {
    const rawPhotoUrls = req.query.photo || [];
    
    // Convertir a array (si es un solo string) y filtrar por validez.
    let validUrls = Array.isArray(rawPhotoUrls) ? rawPhotoUrls : [rawPhotoUrls].filter(url => url);
    validUrls = validUrls.slice(0, 3).map(url => {
        // ✅ CLAVE CORREGIDA: Intentar decodificar la URL que viene del frontend.
        // Esto soluciona problemas de doble codificación (%2F, %3A, etc.).
        try {
            return decodeURIComponent(url);
        } catch (e) {
            // Si falla la decodificación (es raro), usar la URL original.
            return url;
        }
    });

    if (validUrls.length === 0) {
        res.setHeader('Location', FALLBACK_IMAGE_URL); 
        res.status(302).end();
        return;
    }

    try {
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Intenta cargar las imágenes.
        const imagePromises = validUrls.map(url => loadImage(url, { crossOrigin: 'anonymous' }));
        const loadedImages = await Promise.all(imagePromises);

        const numImages = loadedImages.length;
        const imgWidthPerSlot = CANVAS_WIDTH / numImages;

        // Lógica de dibujo
        loadedImages.forEach((image, i) => {
            const xPos = i * imgWidthPerSlot;
            const scale = Math.min(imgWidthPerSlot / image.width, CANVAS_HEIGHT / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            const xOffset = xPos + (imgWidthPerSlot - drawWidth) / 2;
            const yOffset = (CANVAS_HEIGHT - drawHeight) / 2;
            ctx.drawImage(image, xOffset, yOffset, drawWidth, drawHeight);
        });

        // Establecer Cache Control agresivo para Facebook
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=2592000, must-revalidate'); 
        
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 }); 
        res.status(200).send(buffer);

    } catch (error) {
        console.error("Error al generar el collage o cargar la imagen:", error.message);
        
        // **Fallback:** Redirigir a la primera imagen simple.
        const fallbackUrl = validUrls[0] || FALLBACK_IMAGE_URL; 
        res.setHeader('Location', fallbackUrl); 
        res.status(302).end(); // Devolver 302 para que el bot rastree la nueva URL de imagen.
    }
};