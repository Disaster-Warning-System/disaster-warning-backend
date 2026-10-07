const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/database");
const hazardReportRoutes = require("./routes/hazardReportRoutes");
const shelterRoutes = require("./routes/shelterRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/hazard-reports", hazardReportRoutes);
app.use("/api/shelters", shelterRoutes);
app.use("/api/uploads", uploadRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Disaster Warning System API is running" });
});

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
