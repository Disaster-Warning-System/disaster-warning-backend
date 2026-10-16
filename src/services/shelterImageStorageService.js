const mongoose = require("mongoose");
const { Readable } = require("node:stream");

const BUCKET_NAME = "shelterImages";

function getBucket() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error("MongoDB is not connected");
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: BUCKET_NAME,
  });
}

function toObjectId(id) {
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

async function saveImage(buffer, { filename, contentType }) {
  return new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(filename, { contentType });
    stream.once("error", reject);
    stream.once("finish", () => resolve(stream.id));
    Readable.from(buffer).pipe(stream);
  });
}

async function getImage(id) {
  const objectId = toObjectId(id);
  if (!objectId) return null;
  const bucket = getBucket();
  const [file] = await bucket.find({ _id: objectId }).toArray();
  if (!file) return null;
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(objectId)) chunks.push(chunk);
  return { file, buffer: Buffer.concat(chunks) };
}

async function deleteImage(id) {
  const objectId = toObjectId(id);
  if (!objectId) return false;
  try {
    await getBucket().delete(objectId);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = { deleteImage, getImage, saveImage, toObjectId };
