const express = require("express");
const cors = require("cors");
require("dotenv").config();
const connectDB = require("./config/database");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/alerts", require("./routes/alertRoutes"));

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

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
