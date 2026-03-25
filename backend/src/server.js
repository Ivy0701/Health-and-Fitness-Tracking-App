require("dotenv").config();
const app = require("./app");
const { connectDB } = require("./config/db");
const initTestAccounts = require("./utils/initTestAccounts");
const seedDemoData = require("./utils/seedDemoData");

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    return initTestAccounts();
  })
  .then(() => {
    return seedDemoData();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect MongoDB:", error.message);
    process.exit(1);
  });
