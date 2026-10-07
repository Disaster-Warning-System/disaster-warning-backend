const mongoose = require("mongoose");

const BUCKET_NAME = "hazardPhotos";

function getBucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: BUCKET_NAME,
  });
}

function getObjectId(fileId) {
  if (!mongoose.isValidObjectId(fileId)) {
    return null;
  }
  return new mongoose.Types.ObjectId(fileId);
}

async function findFile(fileId) {
  const objectId = getObjectId(fileId);
  if (!objectId) {
    return null;
  }
  const files = await getBucket().find({ _id: objectId }).toArray();
  return files[0] || null;
}

function uploadFile(filePath, { filename, contentType }) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, { contentType });
    const source = require("fs").createReadStream(filePath);

    source.on("error", reject);
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    source.pipe(uploadStream);
  });
}

function openDownloadStream(fileId) {
  const objectId = getObjectId(fileId);
  if (!objectId) {
    return null;
  }
  return getBucket().openDownloadStream(objectId);
}

async function deleteFile(fileId) {
  const objectId = getObjectId(fileId);
  if (!objectId) {
    return false;
  }
  try {
    await getBucket().delete(objectId);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

module.exports = {
  deleteFile,
  findFile,
  getObjectId,
  openDownloadStream,
  uploadFile,
};
