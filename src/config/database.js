const mongoose = require("mongoose");
const dns = require("node:dns");
const { isIP } = require("node:net");

const configureMongoDns = () => {
  const configuredServers = process.env.MONGO_DNS_SERVERS;
  if (!configuredServers) return;

  const servers = configuredServers
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length === 0 || servers.some((server) => isIP(server) === 0)) {
    throw new Error(
      "MONGO_DNS_SERVERS must contain comma-separated IPv4 or IPv6 addresses.",
    );
  }

  // dns.setServers configures Node's process-wide resolver. Keep this optional
  // so deployments can use their network's standard DNS configuration.
  dns.setServers(servers);
};

const connectDB = async () => {
  try {
    configureMongoDns();
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

module.exports = connectDB;
