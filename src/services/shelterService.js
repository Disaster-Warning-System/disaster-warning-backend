const mongoose = require("mongoose");
const Shelter = require("../models/Shelter");
const shelterImageStorage = require("./shelterImageStorageService");

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
    locationPoint: input.locationPoint,
    capacity: input.capacity,
    occupancy: input.occupancy ?? 0,
    operationalStatus: input.operationalStatus ?? "Open",
    remarks: input.remarks?.trim() ?? "",
    imageId: input.imageId || null,
  });

const updateShelter = async (id, input) => {
  const current = await getShelter(id);
  const nextOccupancy = input.occupancy ?? current.occupancy;
  if (nextOccupancy > current.capacity) {
    throw new ShelterServiceError(
      "Current occupancy cannot exceed capacity. Enter a lower occupancy.",
      400,
    );
  }
  const updates = { ...input };
  if (typeof updates.location === "string")
    updates.location = updates.location.trim();
  if (typeof updates.remarks === "string")
    updates.remarks = updates.remarks.trim();
  const updated = await Shelter.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (
    current.imageId &&
    String(current.imageId) !== String(updated.imageId || "")
  ) {
    // Image cleanup is best effort after a successful record update.
    await shelterImageStorage.deleteImage(current.imageId).catch((error) =>
      console.error("Could not remove replaced shelter image:", error.message),
    );
  }
  return updated;
};

const deleteShelter = async (id) => {
  if (!mongoose.isValidObjectId(id))
    throw new ShelterServiceError("Shelter not found", 404);
  const shelter = await Shelter.findByIdAndDelete(id);
  if (!shelter) throw new ShelterServiceError("Shelter not found", 404);
  if (shelter.imageId) {
    await shelterImageStorage.deleteImage(shelter.imageId).catch((error) =>
      console.error("Could not remove deleted shelter image:", error.message),
    );
  }
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
