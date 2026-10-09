const {
  ShelterServiceError,
  listShelters,
  getShelter,
  getShelterOccupancyHistory,
  createShelter,
  updateShelter,
  deleteShelter,
} = require("../services/shelterService");
const {
  validateCreateShelter,
  validateUpdateShelter,
} = require("../validators/shelterValidator");

const describeModelValidationError = (error) => {
  const field = error?.path;
  if (error?.name === "CastError") {
    if (field === "capacity")
      return "Capacity must be a whole number greater than 0. Enter a valid capacity.";
    if (field === "occupancy")
      return "Current occupancy must be a whole number from 0 up to capacity.";
    if (field?.startsWith("locationPoint"))
      return "Map location is invalid. Select a valid point on the map.";
    return `The ${field || "shelter"} value is invalid. Check it and try again.`;
  }

  if (field === "name")
    return "Shelter name is invalid. Enter a non-empty name of 120 characters or fewer.";
  if (field === "location")
    return "Shelter location is invalid. Enter a non-empty location of 240 characters or fewer.";
  if (field?.startsWith("locationPoint"))
    return "Map location is invalid. Select a valid point on the map.";
  if (field === "capacity")
    return "Capacity must be a whole number greater than 0. Enter a valid capacity.";
  if (field === "occupancy")
    return "Current occupancy must be a whole number from 0 up to capacity.";
  if (field === "operationalStatus")
    return "Operational status must be Open or Closed. Choose one of these options.";
  if (field === "remarks")
    return "Remarks must be 500 characters or fewer. Shorten the note.";
  return "Shelter information is invalid. Check the entered values and try again.";
};

const sendError = (res, error) => {
  const isModelValidationError =
    error?.name === "ValidationError" || error?.name === "CastError";
  const statusCode =
    error instanceof ShelterServiceError
      ? error.statusCode
      : isModelValidationError
        ? 400
        : 500;
  const validationErrors =
    error?.name === "ValidationError"
      ? Object.values(error.errors || {}).map(describeModelValidationError)
      : isModelValidationError
        ? [describeModelValidationError(error)]
        : undefined;
  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? "An unexpected error occurred"
        : isModelValidationError
          ? "Correct the shelter fields listed below and try again."
          : error.message,
    ...(validationErrors ? { errors: validationErrors } : {}),
  });
};

const getShelters = async (req, res) => {
  try {
    const shelters = await listShelters();
    return res
      .status(200)
      .json({ success: true, count: shelters.length, data: shelters });
  } catch (error) {
    return sendError(res, error);
  }
};

const getShelterById = async (req, res) => {
  try {
    const shelter = await getShelter(req.params.id);
    return res.status(200).json({ success: true, data: shelter });
  } catch (error) {
    return sendError(res, error);
  }
};

const getShelterOccupancyHistoryById = async (req, res) => {
  try {
    const history = await getShelterOccupancyHistory(req.params.id);
    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    return sendError(res, error);
  }
};

const createShelterRecord = async (req, res) => {
  const errors = validateCreateShelter(req.body);
  if (errors.length)
    return res
      .status(400)
      .json({
        success: false,
        message: "Correct the shelter fields listed below and try again.",
        errors,
      });
  try {
    const shelter = await createShelter(req.body);
    return res.status(201).json({ success: true, data: shelter });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateShelterRecord = async (req, res) => {
  const errors = validateUpdateShelter(req.body);
  if (errors.length)
    return res
      .status(400)
      .json({
        success: false,
        message: "Correct the shelter fields listed below and try again.",
        errors,
      });
  try {
    const shelter = await updateShelter(req.params.id, req.body);
    return res.status(200).json({ success: true, data: shelter });
  } catch (error) {
    return sendError(res, error);
  }
};

const deleteShelterRecord = async (req, res) => {
  try {
    const shelter = await deleteShelter(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Shelter deleted successfully",
      data: shelter,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  getShelters,
  getShelterById,
  getShelterOccupancyHistoryById,
  createShelterRecord,
  updateShelterRecord,
  deleteShelterRecord,
};
