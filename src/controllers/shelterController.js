const {
  ShelterServiceError,
  listShelters,
  getShelter,
  createShelter,
  updateShelter,
} = require("../services/shelterService");
const { validateCreateShelter, validateUpdateShelter } = require("../validators/shelterValidator");

const sendError = (res, error) => {
  const isModelValidationError =
    error?.name === "ValidationError" || error?.name === "CastError";
  const statusCode = error instanceof ShelterServiceError
    ? error.statusCode
    : isModelValidationError ? 400 : 500;
  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500
      ? "An unexpected error occurred"
      : isModelValidationError ? "Validation failed" : error.message,
  });
};

const getShelters = async (req, res) => {
  try {
    const shelters = await listShelters();
    return res.status(200).json({ success: true, count: shelters.length, data: shelters });
  } catch (error) { return sendError(res, error); }
};

const getShelterById = async (req, res) => {
  try {
    const shelter = await getShelter(req.params.id);
    return res.status(200).json({ success: true, data: shelter });
  } catch (error) { return sendError(res, error); }
};

const createShelterRecord = async (req, res) => {
  const errors = validateCreateShelter(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });
  try {
    const shelter = await createShelter(req.body);
    return res.status(201).json({ success: true, data: shelter });
  } catch (error) { return sendError(res, error); }
};

const updateShelterRecord = async (req, res) => {
  const errors = validateUpdateShelter(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });
  try {
    const shelter = await updateShelter(req.params.id, req.body);
    return res.status(200).json({ success: true, data: shelter });
  } catch (error) { return sendError(res, error); }
};

module.exports = { getShelters, getShelterById, createShelterRecord, updateShelterRecord };
