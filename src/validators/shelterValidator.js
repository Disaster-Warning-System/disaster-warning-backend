const statuses = new Set(["Open", "Closed"]);

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isWholeNumber = Number.isInteger;

const validateCreateShelter = (body) => {
  if (!isRecord(body)) return ["Request body must be an object"];
  const errors = [];
  if (typeof body.name !== "string" || !body.name.trim())
    errors.push("name must not be empty");
  else if (body.name.trim().length > 120)
    errors.push("name must be 120 characters or fewer");
  if (typeof body.location !== "string" || !body.location.trim())
    errors.push("location must not be empty");
  else if (body.location.trim().length > 240)
    errors.push("location must be 240 characters or fewer");
  if (!isWholeNumber(body.capacity) || body.capacity < 1)
    errors.push("capacity must be a positive whole number");
  if (
    body.occupancy !== undefined &&
    (!isWholeNumber(body.occupancy) || body.occupancy < 0)
  ) {
    errors.push("occupancy must be a non-negative whole number");
  }
  if (
    body.occupancy !== undefined &&
    isWholeNumber(body.capacity) &&
    body.occupancy > body.capacity
  ) {
    errors.push("occupancy cannot exceed capacity");
  }
  if (
    body.operationalStatus !== undefined &&
    !statuses.has(body.operationalStatus)
  ) {
    errors.push("operationalStatus must be Open or Closed");
  }
  if (body.remarks !== undefined && typeof body.remarks !== "string")
    errors.push("remarks must be a string");
  else if (typeof body.remarks === "string" && body.remarks.length > 500)
    errors.push("remarks must be 500 characters or fewer");
  return errors;
};

const validateUpdateShelter = (body) => {
  if (!isRecord(body)) return ["Request body must be an object"];
  const errors = [];
  // Keep shelter identity and capacity immutable through routine status updates.
  const allowedFields = ["occupancy", "operationalStatus", "remarks"];
  const suppliedFields = Object.keys(body);
  if (suppliedFields.length === 0)
    errors.push("At least one shelter field must be provided");
  for (const field of suppliedFields) {
    if (!allowedFields.includes(field))
      errors.push(`${field} cannot be updated through this endpoint`);
  }
  if (
    body.occupancy !== undefined &&
    (!isWholeNumber(body.occupancy) || body.occupancy < 0)
  ) {
    errors.push("occupancy must be a non-negative whole number");
  }
  if (
    body.operationalStatus !== undefined &&
    !statuses.has(body.operationalStatus)
  ) {
    errors.push("operationalStatus must be Open or Closed");
  }
  if (body.remarks !== undefined && typeof body.remarks !== "string")
    errors.push("remarks must be a string");
  else if (typeof body.remarks === "string" && body.remarks.length > 500)
    errors.push("remarks must be 500 characters or fewer");
  return errors;
};

module.exports = { validateCreateShelter, validateUpdateShelter };
