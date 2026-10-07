const express = require("express");
const {
  getShelters,
  getShelterById,
  createShelterRecord,
  updateShelterRecord,
  deleteShelterRecord,
} = require("../controllers/shelterController");

const router = express.Router();
router.get("/", getShelters);
router.post("/", createShelterRecord);
router.get("/:id", getShelterById);
router.patch("/:id", updateShelterRecord);
router.delete("/:id", deleteShelterRecord);

module.exports = router;
