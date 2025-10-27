// /api/generate-collage.js
// Requiere: npm install canvas
import { createCanvas, loadImage } from 'canvas';
import { URLSearchParams } from 'url';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 630;
const FALLBACK_IMAGE_URL = 'https://malim-shop.vercel.app/placeholder.jpg';

export default async (req, res) => {
    // req.query.photo será un string si es 1, o un array si son múltiples
    const photoUrls = req.query.photo || [];
    // Convertir a array y limitar a las primeras 3 (incluso si es solo 1)
    const validUrls = Array.isArray(photoUrls) ? photoUrls.slice(0, 3) : [photoUrls].filter(url => url).slice(0, 3);
    
    if (validUrls.length === 0) {
        // Si no hay fotos, redirigir al placeholder estático
        res.setHeader('Location', FALLBACK_IMAGE_URL); 
        res.status(302).end();
        return;
    }

    try {
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext("2d");

        // 1. Fondo blanco (marco)
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 2. Descargar y dibujar imágenes
        // Usamos { crossOrigin: 'anonymous' } para asegurar que podemos cargar imágenes de R2/otro CDN
        const imagePromises = validUrls.map(url => loadImage(url, { crossOrigin: 'anonymous' }));
        const loadedImages = await Promise.all(imagePromises);

        const numImages = loadedImages.length;
        // La lógica del collage: dividimos el canvas en ranuras iguales
        const imgWidthPerSlot = CANVAS_WIDTH / numImages;

        loadedImages.forEach((image, i) => {
            const xPos = i * imgWidthPerSlot;
            
            // Lógica de escala y centrado (mode "contain" o "fit")
            const scale = Math.min(imgWidthPerSlot / image.width, CANVAS_HEIGHT / image.height);
            const drawWidth = image.width * scale;
            const drawHeight = image.height * scale;
            
            // Centrar la imagen dentro de su ranura (creando el marco blanco en los lados)
            const xOffset = xPos + (imgWidthPerSlot - drawWidth) / 2;
            const yOffset = (CANVAS_HEIGHT - drawHeight) / 2;

            ctx.drawImage(image, xOffset, yOffset, drawWidth, drawHeight);
        });

        // 3. Establecer Cache Control agresivo (¡CLAVE PARA AHORRAR RECURSOS!)
        // Cacheamos esta imagen generada por 30 días, ya que la prenda no cambiará de fotos a menudo
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=2592000, must-revalidate'); 
        
        // 4. Enviar el buffer JPEG
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 }); 
        res.status(200).send(buffer);

    } catch (error) {
        console.error("Error en generate-collage:", error);
        // Fallback: Redirigir a la imagen original o al placeholder
        res.setHeader('Location', validUrls[0] || FALLBACK_IMAGE_URL); 
        res.status(302).end();
    }
};