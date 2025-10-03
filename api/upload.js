// runtime: nodejs18.x
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js";
import { setCORS, handlePreflight } from "./_lib/cors.js";
import formidable from "formidable";
import fs from "node:fs/promises";

// NOTA: En Vercel Functions (Node), NO hay bodyParser automático (no es Next.js API),
// así que formidable puede leer el stream de `req` directamente.
const form = formidable({
  multiples: true,
  maxFiles: 10,
  // Si subes varios archivos, cuida el tamaño total del request (ver nota al final).
  maxFileSize: 10 * 1024 * 1024, // 10 MB por archivo
});

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Método no permitido" });
  }

  // Validación de envs (igual que en tu middleware original)
  const requiredVars = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET", "R2_DEV_URL"];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length) {
    return res.status(500).json({ success: false, error: "Env incompletas", missing });
  }

  try {
    const files = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        const f = files.files;
        const arr = Array.isArray(f) ? f : (f ? [f] : []);
        resolve(arr);
      });
    });

    if (!files.length) {
      return res.status(400).json({ success: false, error: "No se recibieron archivos" });
    }

    const uploadedUrls = [];
    const errors = [];

    await Promise.all(files.map(async (file) => {
      try {
        const safeOriginal = (file.originalFilename || "file").replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `malim-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${safeOriginal}`;
        const body = await fs.readFile(file.filepath);

        await s3.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: file.mimetype || "application/octet-stream",
        }));

        uploadedUrls.push(`${process.env.R2_DEV_URL}/${key}`);
      } catch (e) {
        errors.push({ file: file.originalFilename, error: e.message });
      }
    }));

    res.status(200).json({
      success: true,
      urls: uploadedUrls,
      message: `Subidos ${uploadedUrls.length} de ${files.length} archivos`,
      ...(errors.length > 0 && { warnings: errors }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
