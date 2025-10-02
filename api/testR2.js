// api/testR2.js
import { S3Client } from "@aws-sdk/client-s3";

export default async function handler(req, res) {
  try {
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) {
      return res.status(500).json({ error: "Variables de entorno faltantes" });
    }

    let s3;
    try {
      s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY,
          secretAccessKey: process.env.R2_SECRET_KEY,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: "Error inicializando S3Client", details: err.message });
    }

    return res.status(200).json({
      message: "S3Client inicializado correctamente",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
