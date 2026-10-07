const express = require("express");
const multer = require("multer");
const os = require("os");
const { deleteHazardPhoto, getHazardPhoto, uploadHazardPhoto, MAX_FILE_SIZE, ALLOWED_TYPES } = require("../controllers/uploadController");

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, callback) => {
    callback(null, ALLOWED_TYPES.has(file.mimetype));
  },
});

const router = express.Router();
router.post("/hazard-photo", (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ success: false, message: "Photo must be 5 MB or smaller" });
    }
    if (error) {
      return res.status(400).json({ success: false, message: "Only JPEG, PNG, and WebP images are supported" });
    }
    return next();
  });
}, uploadHazardPhoto);
router.get("/hazard-photo/:fileId", getHazardPhoto);
router.delete("/hazard-photo/:fileId", deleteHazardPhoto);

module.exports = router;
