const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/database");
const hazardReportRoutes = require("./routes/hazardReportRoutes");
const shelterRoutes = require("./routes/shelterRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const userRoutes = require("./routes/userRoutes");
const officerRoutes = require("./routes/officerRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

const corsOrigins = (process.env.CORS_ORIGINS ||
  "http://localhost:3000,http://localhost:5173,http://localhost:8081")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use("/api/hazard-reports", hazardReportRoutes);
app.use("/api/shelters", shelterRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/auth", userRoutes);
app.use("/api/officer", officerRoutes);
app.use("/api/reports", verificationRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Disaster Warning System API is running" });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
