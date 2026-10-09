const express = require("express");
const shelterImageRoutes = require("./shelterImageRoutes");
const {
  getShelters,
  getShelterById,
  getShelterOccupancyHistoryById,
  createShelterRecord,
  updateShelterRecord,
  deleteShelterRecord,
} = require("../controllers/shelterController");

const router = express.Router();
// Keep the static image path ahead of /:id so "images" is never parsed as an ID.
router.use("/images", shelterImageRoutes);
router.get("/", getShelters);
router.post("/", createShelterRecord);
router.get("/:id/history", getShelterOccupancyHistoryById);
router.get("/:id", getShelterById);
router.patch("/:id", updateShelterRecord);
router.delete("/:id", deleteShelterRecord);

module.exports = router;
