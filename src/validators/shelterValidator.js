const statuses = new Set(["Open", "Closed"]);

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isWholeNumber = Number.isInteger;
const isValidLocationPoint = (point) => {
  if (
    !isRecord(point) ||
    point.type !== "Point" ||
    !Array.isArray(point.coordinates) ||
    point.coordinates.length !== 2
  ) {
    return false;
  }
  const [longitude, latitude] = point.coordinates;
  return (
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90
  );
};
const objectBodyError =
  "Shelter data must be an object. Submit the shelter fields as JSON.";

const validateCreateShelter = (body) => {
  if (!isRecord(body)) return [objectBodyError];
  const errors = [];
  if (typeof body.name !== "string" || !body.name.trim())
    errors.push("Shelter name is required. Enter a name.");
  else if (body.name.trim().length > 120)
    errors.push("Shelter name must be 120 characters or fewer. Shorten the name.");
  if (typeof body.location !== "string" || !body.location.trim())
    errors.push("Shelter location is required. Enter a location.");
  else if (body.location.trim().length > 240)
    errors.push("Shelter location must be 240 characters or fewer. Shorten it.");
  if (body.locationPoint === undefined)
    errors.push("Map location is required. Select the shelter on the map.");
  else if (!isValidLocationPoint(body.locationPoint))
    errors.push(
      "Map location is invalid. Select a point within latitude -90 to 90 and longitude -180 to 180.",
    );
  if (!isWholeNumber(body.capacity) || body.capacity < 1)
    errors.push("Capacity must be a whole number greater than 0. Enter a valid capacity.");
  if (
    body.occupancy !== undefined &&
    (!isWholeNumber(body.occupancy) || body.occupancy < 0)
  ) {
    errors.push("Current occupancy must be a whole number from 0 up to capacity.");
  }
  if (
    body.occupancy !== undefined &&
    isWholeNumber(body.capacity) &&
    body.occupancy > body.capacity
  ) {
    errors.push("Current occupancy cannot exceed capacity. Enter a lower occupancy.");
  }
  if (
    body.operationalStatus !== undefined &&
    !statuses.has(body.operationalStatus)
  ) {
    errors.push("Operational status must be Open or Closed. Choose one of these options.");
  }
  if (body.remarks !== undefined && typeof body.remarks !== "string")
    errors.push("Remarks must be text. Enter plain text or leave the field empty.");
  else if (typeof body.remarks === "string" && body.remarks.length > 500)
    errors.push("Remarks must be 500 characters or fewer. Shorten the note.");
  return errors;
};

const validateUpdateShelter = (body) => {
  if (!isRecord(body)) return [objectBodyError];
  const errors = [];
  // Keep shelter identity and capacity immutable through routine status updates.
  const allowedFields = [
    "location",
    "locationPoint",
    "occupancy",
    "operationalStatus",
    "remarks",
  ];
  const suppliedFields = Object.keys(body);
  if (suppliedFields.length === 0)
    errors.push(
      "No shelter changes were provided. Enter a location, occupancy, status, or remarks update.",
    );
  for (const field of suppliedFields) {
    if (!allowedFields.includes(field))
      errors.push(
        `${field} cannot be changed here. Update location, occupancy, operational status, or remarks instead.`,
      );
  }
  if (body.location !== undefined) {
    if (typeof body.location !== "string" || !body.location.trim())
      errors.push("Shelter location is required. Enter a location.");
    else if (body.location.trim().length > 240)
      errors.push("Shelter location must be 240 characters or fewer. Shorten it.");
  }
  if (
    body.locationPoint !== undefined &&
    !isValidLocationPoint(body.locationPoint)
  )
    errors.push(
      "Map location is invalid. Select a point within latitude -90 to 90 and longitude -180 to 180.",
    );
  if (
    body.occupancy !== undefined &&
    (!isWholeNumber(body.occupancy) || body.occupancy < 0)
  ) {
    errors.push("Current occupancy must be a whole number from 0 up to capacity.");
  }
  if (
    body.operationalStatus !== undefined &&
    !statuses.has(body.operationalStatus)
  ) {
    errors.push("Operational status must be Open or Closed. Choose one of these options.");
  }
  if (body.remarks !== undefined && typeof body.remarks !== "string")
    errors.push("Remarks must be text. Enter plain text or leave the field empty.");
  else if (typeof body.remarks === "string" && body.remarks.length > 500)
    errors.push("Remarks must be 500 characters or fewer. Shorten the note.");
  return errors;
};

module.exports = { validateCreateShelter, validateUpdateShelter };
