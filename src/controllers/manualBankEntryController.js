import ManualBankEntry from "../models/manualBankEntry.js";
import Master from "../models/master.js";
import mongoose from "mongoose";

const roundAmount = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeBankIdOrThrow = async (bankId) => {
  if (!bankId) return null;
  const rawId = typeof bankId === "object" && bankId !== null
    ? bankId._id || bankId.id || bankId.toString()
    : bankId;
  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    const error = new Error("Invalid bank ID format");
    error.status = 400;
    throw error;
  }
  const bank = await Master.findOne({ _id: rawId, isDeleted: false }).select("_id name");
  if (!bank) {
    const error = new Error("Bank not found or is inactive");
    error.status = 404;
    throw error;
  }
  return bank._id;
};

const buildBankResponse = (bank) => {
  if (!bank || typeof bank !== "object") return { bankId: null, bank: null };
  const bankId = bank._id ? bank._id : bank;
  const bankInfo = bank && typeof bank === "object" && bank.name
    ? { _id: bankId, name: bank.name }
    : null;
  return { bankId, bank: bankInfo };
};

/** Add manual bank entry: deposit, withdrawal, or transfer */
export const addManualBankEntry = async (req, res) => {
  try {
    const { type, date, amount, description, bankId, toBankId } = req.body;

    if (!type || !["deposit", "withdrawal", "transfer"].includes(type)) {
      return res.status(400).json({
        status: 400,
        message: "type must be deposit, withdrawal, or transfer",
      });
    }
    const amt = roundAmount(amount);
    if (amt <= 0) {
      return res.status(400).json({
        status: 400,
        message: "amount must be a positive number",
      });
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({
        status: 400,
        message: "description is required",
      });
    }

    let normalizedBankId = null;
    let normalizedToBankId = null;

    try {
      normalizedBankId = await normalizeBankIdOrThrow(bankId);
    } catch (e) {
      return res.status(e.status || 400).json({
        status: e.status || 400,
        message: e.message || "Invalid bank ID",
      });
    }

    if (type === "transfer") {
      if (!toBankId || toBankId === bankId) {
        return res.status(400).json({
          status: 400,
          message: "transfer requires a different toBankId",
        });
      }
      try {
        normalizedToBankId = await normalizeBankIdOrThrow(toBankId);
      } catch (e) {
        return res.status(e.status || 400).json({
          status: e.status || 400,
          message: e.message || "Invalid toBankId",
        });
      }
    }

    const entryDate = date ? new Date(date) : new Date();

    if (type === "deposit") {
      const entry = await ManualBankEntry.create({
        type: "deposit",
        date: entryDate,
        amount: amt,
        description: description.trim(),
        bankId: normalizedBankId,
      });
      const populated = await ManualBankEntry.findById(entry._id)
        .populate("bankId", "_id name")
        .lean();
      const { bankId: bid, bank } = buildBankResponse(populated?.bankId);
      const { invalidateCache } = await import("../util/cacheHelper.js");
      invalidateCache("income");
      invalidateCache("dashboard");
      return res.status(201).json({
        status: 201,
        message: "Manual deposit added successfully",
        data: {
          _id: entry._id,
          incExpType: 1,
          source: "manual",
          type: "deposit",
          date: entry.date,
          receivedAmount: amt,
          description: description.trim(),
          bankId: bid,
          bank,
        },
      });
    }

    if (type === "withdrawal") {
      const ExpanceIncome = (await import("../models/expance_inc.js")).default;
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const [manualEntry] = await ManualBankEntry.create(
          [
            {
              type: "withdrawal",
              date: entryDate,
              amount: amt,
              description: description.trim(),
              bankId: normalizedBankId,
            },
          ],
          { session }
        );

        const [expense] = await ExpanceIncome.create(
          [
            {
              date: entryDate,
              description: description.trim(),
              paidAmount: amt,
              dueAmount: 0,
              bankId: normalizedBankId,
              status: "paid",
              manualBankEntryId: manualEntry._id,
              manualType: "withdrawal",
            },
          ],
          { session }
        );

        await ManualBankEntry.updateOne(
          { _id: manualEntry._id },
          { $set: { linkedExpenseId: expense._id } },
          { session }
        );

        await session.commitTransaction();

        const populated = await ExpanceIncome.findById(expense._id)
          .populate("bankId", "_id name")
          .lean();
        const { bankId: bid, bank } = buildBankResponse(populated?.bankId);
        const { invalidateCache } = await import("../util/cacheHelper.js");
        invalidateCache("income");
        invalidateCache("dashboard");
        return res.status(201).json({
          status: 201,
          message: "Manual withdrawal added successfully",
          data: {
            _id: expense._id,
            incExpType: 2,
            source: "manual",
            type: "withdrawal",
            date: entryDate,
            paidAmount: amt,
            description: description.trim(),
            bankId: bid,
            bank,
          },
        });
      } catch (e) {
        await session.abortTransaction();
        throw e;
      } finally {
        session.endSession();
      }
    }

    if (type === "transfer") {
      const fromBank = await Master.findById(normalizedBankId).select("name").lean();
      const toBank = await Master.findById(normalizedToBankId).select("name").lean();
      const toName = toBank?.name || "Bank";
      const fromName = fromBank?.name || "Bank";
      const descFrom = description.trim() || `Transfer to ${toName}`;

      const ExpanceIncome = (await import("../models/expance_inc.js")).default;
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const [transferEntry] = await ManualBankEntry.create(
          [
            {
              type: "transfer",
              date: entryDate,
              amount: amt,
              description: descFrom,
              bankId: normalizedBankId,
              toBankId: normalizedToBankId,
            },
          ],
          { session }
        );

        const [expense] = await ExpanceIncome.create(
          [
            {
              date: entryDate,
              description: descFrom,
              paidAmount: amt,
              dueAmount: 0,
              bankId: normalizedBankId,
              status: "paid",
              manualBankEntryId: transferEntry._id,
              manualType: "transfer",
            },
          ],
          { session }
        );

        await ManualBankEntry.updateOne(
          { _id: transferEntry._id },
          { $set: { linkedExpenseId: expense._id } },
          { session }
        );

        await session.commitTransaction();

      const { invalidateCache } = await import("../util/cacheHelper.js");
      invalidateCache("income");
      invalidateCache("dashboard");

      return res.status(201).json({
        status: 201,
        message: "Transfer recorded successfully",
        data: {
          _id: transferEntry._id,
          type: "transfer",
          fromBankId: normalizedBankId,
          toBankId: normalizedToBankId,
        },
      });
      } catch (e) {
        await session.abortTransaction();
        throw e;
      } finally {
        session.endSession();
      }
    }

    return res.status(400).json({ status: 400, message: "Invalid type" });
  } catch (error) {
    console.error("Error adding manual bank entry:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const softDeleteManualBankEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    if (!entryId) {
      return res.status(400).json({ status: 400, message: "entryId is required" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const entry = await ManualBankEntry.findById(entryId).session(session);
      if (!entry) {
        return res.status(404).json({ status: 404, message: "Manual entry not found" });
      }
      if (entry.isDeleted) {
        return res.status(400).json({ status: 400, message: "Manual entry already deleted" });
      }

      entry.isDeleted = true;
      entry.deletedAt = new Date();
      await entry.save({ session });

      if (entry.linkedExpenseId) {
        const ExpanceIncome = (await import("../models/expance_inc.js")).default;
        await ExpanceIncome.updateOne(
          { _id: entry.linkedExpenseId },
          { $set: { isDeleted: true, deletedAt: new Date() } },
          { session }
        );
      }

      await session.commitTransaction();

      const { invalidateCache } = await import("../util/cacheHelper.js");
      invalidateCache("income");
      invalidateCache("dashboard");

      return res.status(200).json({
        status: 200,
        message: "Ledger entry deleted successfully",
        data: { _id: entry._id, isDeleted: true, deletedAt: entry.deletedAt },
      });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Error soft-deleting manual bank entry:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export const restoreManualBankEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    if (!entryId) {
      return res.status(400).json({ status: 400, message: "entryId is required" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const entry = await ManualBankEntry.findById(entryId).session(session);
      if (!entry) {
        return res.status(404).json({ status: 404, message: "Manual entry not found" });
      }
      if (!entry.isDeleted) {
        return res.status(400).json({ status: 400, message: "Manual entry is not deleted" });
      }

      entry.isDeleted = false;
      entry.deletedAt = null;
      await entry.save({ session });

      if (entry.linkedExpenseId) {
        const ExpanceIncome = (await import("../models/expance_inc.js")).default;
        await ExpanceIncome.updateOne(
          { _id: entry.linkedExpenseId },
          { $set: { isDeleted: false, deletedAt: null } },
          { session }
        );
      }

      await session.commitTransaction();

      const { invalidateCache } = await import("../util/cacheHelper.js");
      invalidateCache("income");
      invalidateCache("dashboard");

      return res.status(200).json({
        status: 200,
        message: "Ledger entry restored successfully",
        data: { _id: entry._id, isDeleted: false },
      });
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Error restoring manual bank entry:", error);
    return res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default {
  addManualBankEntry,
  softDeleteManualBankEntry,
  restoreManualBankEntry,
};
