const crypto = require("crypto");
const fs = require("fs/promises");
const HazardReport = require("../models/HazardReport");
const {
  deleteFile,
  findFile,
  getObjectId,
  openDownloadStream,
  uploadFile,
} = require("../services/gridfsService");

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function hasImageSignature(filePath, mimeType) {
  const handle = await require("fs/promises").open(filePath, "r");
  const buffer = Buffer.alloc(12);
  await handle.read(buffer, 0, buffer.length, 0);
  await handle.close();
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP";
  }
  return false;
}

async function uploadHazardPhoto(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "An image file is required" });
  }

  try {
    if (!ALLOWED_TYPES.has(req.file.mimetype) || !(await hasImageSignature(req.file.path, req.file.mimetype))) {
      return res.status(400).json({ success: false, message: "Only JPEG, PNG, and WebP images are supported" });
    }

    const fileId = await uploadFile(req.file.path, {
      filename: `hazard-photo-${crypto.randomUUID()}`,
      contentType: req.file.mimetype,
    });
    return res.status(201).json({
      message: "Photo uploaded successfully",
      fileId: fileId.toString(),
    });
  } catch (error) {
    console.error("Failed to store hazard report photo");
    return res.status(500).json({ success: false, message: "Unable to store the photo" });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
}

async function getHazardPhoto(req, res) {
  const file = await findFile(req.params.fileId);
  if (!file) {
    return res.status(404).json({ success: false, message: "Photo not found" });
  }
  res.setHeader("Content-Type", file.contentType || "application/octet-stream");
  res.setHeader("Content-Length", file.length);
  const stream = openDownloadStream(req.params.fileId);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: "Photo not found" });
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

async function deleteHazardPhoto(req, res) {
  const fileId = getObjectId(req.params.fileId);
  if (!fileId) {
    return res.status(400).json({ success: false, message: "Invalid photo file ID" });
  }
  // Deleting is only for cleaning up an upload whose report was never created. Evidence that
  // belongs to a report must stay available to the officer reviewing it.
  const attached = await HazardReport.exists({
    $or: [{ photoFileId: fileId }, { "additionalInfo.photoFileId": fileId }],
  });
  if (attached) {
    return res.status(409).json({ success: false, message: "Photo is attached to a report" });
  }
  const deleted = await deleteFile(req.params.fileId);
  return res.status(deleted ? 204 : 404).send();
}

module.exports = { deleteHazardPhoto, getHazardPhoto, uploadHazardPhoto, MAX_FILE_SIZE, ALLOWED_TYPES };
