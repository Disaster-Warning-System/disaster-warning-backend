const express = require("express");
const multer = require("multer");
const {
  deleteShelterImage,
  getShelterImage,
  uploadShelterImage,
} = require("../controllers/shelterImageController");

const router = express.Router();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new Error("Choose a JPG, PNG, or WebP image no larger than 5 MB."));
    }
    return callback(null, true);
  },
});

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      const isLimit = error.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({
        success: false,
        message: isLimit
          ? "Image is larger than 5 MB. Choose a smaller image."
          : error.message || "Choose a valid shelter image.",
      });
    }
    return next();
  });
}, uploadShelterImage);
router.get("/:imageId", getShelterImage);
router.delete("/:imageId", deleteShelterImage);

module.exports = router;
