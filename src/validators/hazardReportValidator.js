const hazardTypes = new Set([
  "Flood",
  "Landslide",
  "Cyclone",
  "Fire",
  "Earthquake",
  "Other",
]);
const severities = new Set(["Low", "Medium", "High"]);

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

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

  if (body.severity !== undefined && !severities.has(body.severity)) {
    errors.push("severity must be Low, Medium, or High");
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
    if (location.district !== undefined && typeof location.district !== "string") {
      errors.push("location.district must be a string");
    }
  }

  if (body.evidence !== undefined && (!Array.isArray(body.evidence) || body.evidence.some((item) =>
    !item || typeof item !== "object" || typeof item.url !== "string" || !item.url.trim() ||
    (item.type !== undefined && typeof item.type !== "string")
  ))) {
    errors.push("evidence must contain items with url and type strings");
  }

  if (
    body.photoFileId !== undefined &&
    body.photoFileId !== null &&
    (typeof body.photoFileId !== "string" || !/^[a-f\d]{24}$/i.test(body.photoFileId))
  ) {
    errors.push("photoFileId must be a valid file ID or null");
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