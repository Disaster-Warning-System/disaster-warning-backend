const hazardTypes = new Set([
  "Flood",
  "Landslide",
  "Cyclone",
  "Fire",
  "Earthquake",
  "Other",
]);

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const validateHazardReport = (body) => {
  const errors = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return ["Request body must be an object"];
  }

  if (!hazardTypes.has(body.hazardType)) {
    errors.push("hazardType must be one of the supported hazard types");
  }

  if (typeof body.description !== "string" || !body.description.trim()) {
    errors.push("description must not be empty");
  }

  const location = body.location;
  if (!location || typeof location !== "object" || Array.isArray(location)) {
    errors.push("location must be an object");
  } else {
    const hasGpsCoordinates =
      isFiniteNumber(location.latitude) &&
      isFiniteNumber(location.longitude);
    const hasManualAddress =
      typeof location.address === "string" && location.address.trim().length > 0;

    if (!hasGpsCoordinates && !hasManualAddress) {
      errors.push(
        "location must contain GPS latitude and longitude or a non-empty address"
      );
    }
  }

  if (
    body.photoUrl !== undefined &&
    body.photoUrl !== null &&
    (typeof body.photoUrl !== "string" || !isHttpUrl(body.photoUrl))
  ) {
    errors.push("photoUrl must be an HTTP(S) URL or null");
  }

  if (
    body.reportedBy !== undefined &&
    body.reportedBy !== null &&
    typeof body.reportedBy !== "string"
  ) {
    errors.push("reportedBy must be a string or null");
  }

  return errors;
};

module.exports = { validateHazardReport };