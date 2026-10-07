const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// Express 5 forwards errors thrown in async handlers here automatically
const errorHandler = (err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body" });
  }

  console.error(err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.status ? err.message : "An unexpected error occurred",
  });
};

module.exports = { notFound, errorHandler };
