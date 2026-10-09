const express = require("express");
const shelterImageRoutes = require("./shelterImageRoutes");
const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  getShelters,
  getShelterById,
  getShelterOccupancyHistoryById,
  createShelterRecord,
  updateShelterRecord,
  deleteShelterRecord,
} = require("../controllers/shelterController");

const router = express.Router();
const districtOfficerOnly = [protect, requireRole("District Officer")];
// Keep the static image path ahead of /:id so "images" is never parsed as an ID.
router.use("/images", shelterImageRoutes);
router.get("/", getShelters);
router.post("/", ...districtOfficerOnly, createShelterRecord);
router.get("/:id/history", ...districtOfficerOnly, getShelterOccupancyHistoryById);
router.get("/:id", getShelterById);
router.patch("/:id", ...districtOfficerOnly, updateShelterRecord);
router.delete("/:id", ...districtOfficerOnly, deleteShelterRecord);

module.exports = router;
