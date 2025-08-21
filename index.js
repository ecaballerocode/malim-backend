import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { S3Client, PutObjectCommand, ListObjectsCommand } from "@aws-sdk/client-s3";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ CONFIGURACIÓN CORS PARA PRODUCCIÓN
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ["https://ecaballerocode.github.io", "https://ecaballerocode.github.io/malim-app/"] 
    : "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
  credentials: true
}));

// Manejo de preflight OPTIONS
app.options("*", cors());

// Middleware para logging (solo en desarrollo)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log("🌐", new Date().toISOString(), "-", req.method, req.url);
    console.log("📍 Origin:", req.headers.origin);
    next();
  });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Configuración de multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    mimetype && extname ? cb(null, true) : cb(new Error('Solo se permiten imágenes'));
  }
});

// Configuración de S3 para Cloudflare R2
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

// ✅ MIDDLEWARE DE VALIDACIÓN
const validateEnvVars = (req, res, next) => {
  const requiredVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET', 'R2_DEV_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    return res.status(500).json({
      error: "Configuración incompleta del servidor",
      missing: missingVars
    });
  }
  next();
};

// ✅ RUTA PRINCIPAL DE UPLOAD (ÚNICA - SIN DUPLICADOS)
app.post("/upload", validateEnvVars, upload.array("files", 10), async (req, res) => {
  try {
    console.log("📨 Upload endpoint called");
    const files = req.files;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ 
        error: "No se recibieron archivos",
        success: false
      });
    }

    console.log(`📤 Subiendo ${files.length} archivo(s) a Cloudflare R2`);
    const uploadedUrls = [];
    const errors = [];

    // Subir archivos en paralelo
    await Promise.all(files.map(async (file) => {
      try {
        const fileName = `malim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const params = {
          Bucket: process.env.R2_BUCKET,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(params));
        const publicUrl = `${process.env.R2_DEV_URL}/${fileName}`;
        uploadedUrls.push(publicUrl);
        
        console.log(`✅ Subido: ${fileName}`);

      } catch (fileError) {
        console.error(`❌ Error subiendo ${file.originalname}:`, fileError.message);
        errors.push({
          file: file.originalname,
          error: fileError.message
        });
      }
    }));

    // ✅ ENVIAR RESPUESTA AL FRONTEND CON LAS URLs
    res.json({
      success: true,
      urls: uploadedUrls, // ← ESTO ES LO QUE EL FRONTEND NECESITA
      message: `Subidos ${uploadedUrls.length} de ${files.length} archivos`,
      ...(errors.length > 0 && { warnings: errors })
    });

  } catch (err) {
    console.error("💥 Error en upload:", err.message);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor"
    });
  }
});

// ✅ RUTAS DE HEALTH CHECK
app.get("/health", async (req, res) => {
  try {
    const command = new ListObjectsCommand({ Bucket: process.env.R2_BUCKET });
    const data = await s3.send(command);
    
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "malim-backend",
      bucket: process.env.R2_BUCKET,
      objects_count: data.Contents?.length || 0,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: "ERROR",
      error: error.message,
      service: "malim-backend"
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "🚀 Malim Backend API",
    version: "1.0.0",
    endpoints: {
      upload: "POST /upload",
      health: "GET /health"
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ RUTAS DE DEBUG (SOLO EN DESARROLLO)
if (process.env.NODE_ENV !== 'production') {
  app.get("/test-r2-connection", validateEnvVars, async (req, res) => {
    try {
      const command = new ListObjectsCommand({ Bucket: process.env.R2_BUCKET });
      const data = await s3.send(command);
      
      res.json({
        success: true,
        message: "Conexión R2 exitosa",
        bucket: process.env.R2_BUCKET,
        objects_count: data.Contents?.length || 0,
        sample_objects: data.Contents?.slice(0, 5).map(obj => obj.Key) || []
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        bucket: process.env.R2_BUCKET
      });
    }
  });
}

// ✅ MANEJO DE ERRORES
app.use((err, req, res, next) => {
  console.error("❌ Error no manejado:", err.message);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: "Archivo demasiado grande (máximo 10MB)" });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: "Demasiados archivos (máximo 10)" });
    }
  }
  
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? "Error interno del servidor" 
      : err.message 
  });
});

// ✅ RUTA 404
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint no encontrado",
    path: req.originalUrl
  });
});

// ✅ INICIAR SERVIDOR
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
  console.log(`📦 Bucket R2: ${process.env.R2_BUCKET}`);
});

export default app;