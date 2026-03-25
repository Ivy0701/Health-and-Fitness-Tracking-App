const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required in environment variables");
  }

  const dbName = process.env.MONGODB_DB_NAME || "health&fitness";

  await mongoose.connect(uri, {
    dbName,
    autoIndex: true,
  });

  console.log(`MongoDB connected: ${mongoose.connection.host}/${dbName}`);
}

module.exports = { connectDB, mongoose };
