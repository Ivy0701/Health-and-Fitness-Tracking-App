function errorMiddleware(err, req, res, next) {
  console.error(err);
  let status = err.status || 500;
  let message = err.message || "Internal server error";
  if (err.code === "LIMIT_FILE_SIZE") {
    status = 400;
    message = "Image too large (max 6 MB).";
  }
  res.status(status).json({ message });
}

module.exports = errorMiddleware;
