import mongoose from "mongoose";
import Master from "../models/master.js";

/** Resolves bank master id or returns null; throws { status, message } on invalid id when provided. */
export async function normalizeBankMasterId(bankId) {
  if (bankId === undefined || bankId === null || bankId === "") {
    return null;
  }

  const rawId =
    typeof bankId === "object" && bankId !== null
      ? bankId._id || bankId.id || bankId.toString()
      : bankId;

  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    const error = new Error("Invalid bank ID format");
    error.status = 400;
    throw error;
  }

  const bank = await Master.findOne({ _id: rawId }).select("_id name");
  if (!bank) {
    const error = new Error("Bank not found");
    error.status = 404;
    throw error;
  }

  return bank._id;
}
