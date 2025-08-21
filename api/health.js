// api/health.js
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3 } from "./_lib/s3.js";
import { setCORS, handlePreflight } from "./_lib/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(req, res);

  try {
    const data = await s3.send(
      new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 5 })
    );
    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      bucket: process.env.R2_BUCKET,
      objects_count: (data.Contents || []).length,
      sample_objects: (data.Contents || []).map(o => o.Key),
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    res.status(500).json({ status: "ERROR", error: error.message });
  }
}
