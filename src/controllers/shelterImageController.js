const Shelter = require("../models/Shelter");
const imageStorage = require("../services/shelterImageStorageService");

const uploadShelterImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Choose a shelter image to upload.",
    });
  }

  // Check the file signature as well as its declared MIME type.
  const { buffer, mimetype } = req.file;
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  const signatureType = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null;
  if (!signatureType || signatureType !== mimetype) {
    return res.status(400).json({
      success: false,
      message:
        "The image content does not match its file type. Choose a valid JPG, PNG, or WebP image.",
    });
  }

  try {
    const imageId = await imageStorage.saveImage(buffer, {
      filename: req.file.originalname.replace(/[\\/]/g, "_").slice(0, 120),
      contentType: mimetype,
    });
    return res
      .status(201)
      .json({ success: true, data: { imageId: String(imageId) } });
  } catch (error) {
    console.error("Shelter image upload failed:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Shelter image upload failed. Try again." });
  }
};

const getShelterImage = async (req, res) => {
  try {
    const result = await imageStorage.getImage(req.params.imageId);
    if (!result)
      return res
        .status(404)
        .json({ success: false, message: "Shelter image not found." });
    res.set({
      "Content-Type": result.file.contentType,
      "Content-Length": String(result.buffer.length),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).send(result.buffer);
  } catch (error) {
    console.error("Shelter image retrieval failed:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Shelter image could not be loaded." });
  }
};

const deleteShelterImage = async (req, res) => {
  const { imageId } = req.params;
  if (!imageStorage.toObjectId(imageId)) {
    return res
      .status(400)
      .json({ success: false, message: "Shelter image reference is invalid." });
  }
  try {
    const isAttached = await Shelter.exists({ imageId });
    if (isAttached) {
      return res.status(409).json({
        success: false,
        message: "This image is still attached to a shelter. Update the shelter first.",
      });
    }
    const deleted = await imageStorage.deleteImage(imageId);
    return res.status(deleted ? 200 : 404).json({
      success: deleted,
      message: deleted ? "Shelter image removed." : "Shelter image not found.",
    });
  } catch (error) {
    console.error("Shelter image deletion failed:", error.message);
    return res
      .status(500)
      .json({ success: false, message: "Shelter image could not be removed." });
  }
};

module.exports = { deleteShelterImage, getShelterImage, uploadShelterImage };
