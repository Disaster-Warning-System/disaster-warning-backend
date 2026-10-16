const express = require("express");
const { register, login, addPushToken, removePushToken, updateProfile } = require("../controllers/userController");
const { protect, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.put("/push-token", protect, requireRole("Citizen", "Volunteer"), addPushToken);
router.delete("/push-token", protect, requireRole("Citizen", "Volunteer"), removePushToken);
router.patch("/profile", protect, requireRole("Citizen", "Volunteer"), updateProfile);

module.exports = router;
