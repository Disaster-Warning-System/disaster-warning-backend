const mongoose = require("mongoose");
const Shelter = require("../models/Shelter");

class ShelterServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "ShelterServiceError";
    this.statusCode = statusCode;
  }
}

const listShelters = async () => Shelter.find().sort({ name: 1 });

const getShelter = async (id) => {
  if (!mongoose.isValidObjectId(id))
    throw new ShelterServiceError("Shelter not found", 404);
  const shelter = await Shelter.findById(id);
  if (!shelter) throw new ShelterServiceError("Shelter not found", 404);
  return shelter;
};

const createShelter = async (input) =>
  Shelter.create({
    name: input.name.trim(),
    location: input.location.trim(),
    capacity: input.capacity,
    occupancy: input.occupancy ?? 0,
    operationalStatus: input.operationalStatus ?? "Open",
    remarks: input.remarks?.trim() ?? "",
  });

const updateShelter = async (id, input) => {
  const current = await getShelter(id);
  const nextOccupancy = input.occupancy ?? current.occupancy;
  if (nextOccupancy > current.capacity) {
    throw new ShelterServiceError(
      "Occupancy cannot exceed shelter capacity",
      400,
    );
  }
  const updates = { ...input };
  if (typeof updates.remarks === "string")
    updates.remarks = updates.remarks.trim();
  return Shelter.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  );
};

const deleteShelter = async (id) => {
  if (!mongoose.isValidObjectId(id))
    throw new ShelterServiceError("Shelter not found", 404);
  const shelter = await Shelter.findByIdAndDelete(id);
  if (!shelter) throw new ShelterServiceError("Shelter not found", 404);
  return shelter;
};

module.exports = {
  ShelterServiceError,
  listShelters,
  getShelter,
  createShelter,
  updateShelter,
  deleteShelter,
};
