require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./config/db");
const initTestAccounts = require("./utils/initTestAccounts");
const { isSystemStatusPublic } = require("./config/systemStatusAccess");
const seedDemoData = require("./utils/seedDemoData");

const PORT = process.env.PORT || 5000;
const ENABLE_DEMO_SEED = String(process.env.ENABLE_DEMO_SEED || "").toLowerCase() === "true";

connectDB()
  .then(() => {
    return initTestAccounts();
  })
  .then(() => {
    if (!ENABLE_DEMO_SEED) return null;
    return seedDemoData();
  })
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      if (isSystemStatusPublic()) {
        console.log("GET /api/dashboard/system-status is open (no JWT).");
        if (process.env.NODE_ENV === "production") {
          console.warn("Production: system-status is public; set SYSTEM_STATUS_PUBLIC=false to require login.");
        }
      }
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the other process or change PORT in .env.`);
        console.error(`Example (macOS): lsof -i :${PORT}`);
        process.exit(1);
      }
      throw err;
    });
  })
  .catch((error) => {
    console.error("Failed to connect MongoDB:", error.message);
    process.exit(1);
  });
