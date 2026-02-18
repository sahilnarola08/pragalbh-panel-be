import mongoose from "mongoose";
import Partner from "../models/partner.js";
import PartnerTransaction, { TRANSACTION_TYPES } from "../models/partnerTransaction.js";
import Income from "../models/income.js";
import ExpanseIncome from "../models/expance_inc.js";
import { PAYMENT_STATUS } from "../helper/enums.js";

/**
 * List partners with optional search and pagination.
 */
export async function listPartners({ search, page = 1, limit = 20, isActive } = {}) {
  const query = {};
  if (typeof isActive === "boolean") query.isActive = isActive;
  if (search && search.trim()) {
    query.$or = [
      { name: { $regex: search.trim(), $options: "i" } },
      { email: { $regex: search.trim(), $options: "i" } },
      { phone: { $regex: search.trim(), $options: "i" } },
    ];
  }
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const [partners, totalCount] = await Promise.all([
    Partner.find(query).sort({ createdAt: -1 }).skip(skip).limit(Math.max(1, limit)).lean(),
    Partner.countDocuments(query),
  ]);
  return { partners, totalCount };
}

/**
 * Create a new partner. openingBalance sets initial currentBalance.
 */
export async function createPartner(body, createdBy = null) {
  const openingBalance = Number(body.openingBalance) || 0;
  const partner = await Partner.create({
    name: body.name,
    email: body.email || "",
    phone: body.phone || "",
    openingBalance,
    currentBalance: openingBalance,
    totalInvested: 0,
    totalWithdrawn: 0,
    isActive: body.isActive !== false,
  });
  if (openingBalance !== 0) {
    await PartnerTransaction.create({
      partnerId: partner._id,
      type: TRANSACTION_TYPES[2], // adjustment
      amount: openingBalance,
      balanceAfterTransaction: openingBalance,
      paymentMode: "cash",
      notes: "Opening balance",
      createdBy,
    });
  }
  return partner.toObject ? partner.toObject() : partner;
}

/**
 * Get partner by ID. Throws if not found.
 */
export async function getPartnerById(id) {
  const partner = await Partner.findById(id).lean();
  if (!partner) {
    const err = new Error("Partner not found");
    err.status = 404;
    throw err;
  }
  return partner;
}

/**
 * Update partner (name, email, phone, isActive). Does not change balances.
 */
export async function updatePartner(id, body) {
  const partner = await Partner.findByIdAndUpdate(
    id,
    {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    { new: true, runValidators: true }
  ).lean();
  if (!partner) {
    const err = new Error("Partner not found");
    err.status = 404;
    throw err;
  }
  return partner;
}

/**
 * Add investment: atomic update of partner balances + create transaction.
 */
export async function invest(partnerId, body, createdBy = null) {
  const amount = Number(body.amount);
  if (amount <= 0) {
    const err = new Error("Amount must be greater than 0");
    err.status = 400;
    throw err;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const partner = await Partner.findById(partnerId).session(session);
    if (!partner) {
      const err = new Error("Partner not found");
      err.status = 404;
      throw err;
    }
    const newBalance = (partner.currentBalance || 0) + amount;
    const newTotalInvested = (partner.totalInvested || 0) + amount;
    const transactionDate = body.transactionDate ? new Date(body.transactionDate) : new Date();
    await Partner.updateOne(
      { _id: partnerId },
      {
        $set: {
          currentBalance: newBalance,
          totalInvested: newTotalInvested,
          updatedAt: new Date(),
        },
      },
      { session }
    );
    await PartnerTransaction.create(
      [
        {
          partnerId: new mongoose.Types.ObjectId(partnerId),
          type: "investment",
          amount,
          balanceAfterTransaction: newBalance,
          paymentMode: body.paymentMode || "cash",
          referenceNumber: body.referenceNumber || "",
          notes: body.notes || "",
          transactionDate,
          createdBy: createdBy || null,
        },
      ],
      { session }
    );
    // Add to company balance: record as Income (same as company income module)
    await Income.create(
      [
        {
          date: transactionDate,
          Description: `Partner Investment - ${partner.name}`,
          receivedAmount: amount,
          sellingPrice: amount,
          initialPayment: 0,
          status: PAYMENT_STATUS.RESERVED,
        },
      ],
      { session }
    );
    await session.commitTransaction();
    const updated = await Partner.findById(partnerId).lean();
    return updated;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

/**
 * Withdraw: validate balance, atomic update + create transaction.
 */
export async function withdraw(partnerId, body, createdBy = null) {
  const amount = Number(body.amount);
  if (amount <= 0) {
    const err = new Error("Amount must be greater than 0");
    err.status = 400;
    throw err;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const partner = await Partner.findById(partnerId).session(session);
    if (!partner) {
      const err = new Error("Partner not found");
      err.status = 404;
      throw err;
    }
    const current = partner.currentBalance ?? 0;
    if (current < amount) {
      const err = new Error("Insufficient balance");
      err.status = 400;
      throw err;
    }
    const newBalance = current - amount;
    const newTotalWithdrawn = (partner.totalWithdrawn || 0) + amount;
    const transactionDate = body.transactionDate ? new Date(body.transactionDate) : new Date();
    await Partner.updateOne(
      { _id: partnerId },
      {
        $set: {
          currentBalance: newBalance,
          totalWithdrawn: newTotalWithdrawn,
          updatedAt: new Date(),
        },
      },
      { session }
    );
    await PartnerTransaction.create(
      [
        {
          partnerId: new mongoose.Types.ObjectId(partnerId),
          type: "withdrawal",
          amount,
          balanceAfterTransaction: newBalance,
          paymentMode: body.paymentMode || "cash",
          referenceNumber: body.referenceNumber || "",
          notes: body.notes || "",
          transactionDate,
          createdBy: createdBy || null,
        },
      ],
      { session }
    );
    // Deduct from company balance: record as Expense (same as company expense module)
    await ExpanseIncome.create(
      [
        {
          date: transactionDate,
          description: `Partner Withdrawal - ${partner.name}`,
          paidAmount: amount,
          dueAmount: 0,
          status: PAYMENT_STATUS.PAID,
        },
      ],
      { session }
    );
    await session.commitTransaction();
    const updated = await Partner.findById(partnerId).lean();
    return updated;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

/**
 * Adjustment: add or subtract from current balance (amount can be negative).
 */
export async function adjust(partnerId, body, createdBy = null) {
  const amount = Number(body.amount);
  if (Number.isNaN(amount) || amount === 0) {
    const err = new Error("Adjustment amount cannot be zero");
    err.status = 400;
    throw err;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const partner = await Partner.findById(partnerId).session(session);
    if (!partner) {
      const err = new Error("Partner not found");
      err.status = 404;
      throw err;
    }
    const current = partner.currentBalance ?? 0;
    const newBalance = current + amount;
    const transactionDate = body.transactionDate ? new Date(body.transactionDate) : new Date();
    await Partner.updateOne(
      { _id: partnerId },
      {
        $set: {
          currentBalance: newBalance,
          updatedAt: new Date(),
        },
      },
      { session }
    );
    await PartnerTransaction.create(
      [
        {
          partnerId: new mongoose.Types.ObjectId(partnerId),
          type: "adjustment",
          amount,
          balanceAfterTransaction: newBalance,
          paymentMode: "cash",
          notes: body.notes || "Balance adjustment",
          transactionDate,
          createdBy: createdBy || null,
        },
      ],
      { session }
    );
    await session.commitTransaction();
    const updated = await Partner.findById(partnerId).lean();
    return updated;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

/**
 * Get transactions for a partner with pagination.
 */
export async function getTransactions(partnerId, { page = 1, limit = 20 } = {}) {
  const exists = await Partner.findById(partnerId).select("_id").lean();
  if (!exists) {
    const err = new Error("Partner not found");
    err.status = 404;
    throw err;
  }
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const [transactions, totalCount] = await Promise.all([
    PartnerTransaction.find({ partnerId })
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, limit))
      .lean(),
    PartnerTransaction.countDocuments({ partnerId }),
  ]);
  return { transactions, totalCount };
}

/**
 * Get partner summary (partner + totals). Same as getPartnerById for this schema.
 */
export async function getSummary(partnerId) {
  const partner = await getPartnerById(partnerId);
  return {
    ...partner,
    summary: {
      currentBalance: partner.currentBalance ?? 0,
      totalInvested: partner.totalInvested ?? 0,
      totalWithdrawn: partner.totalWithdrawn ?? 0,
      openingBalance: partner.openingBalance ?? 0,
    },
  };
}
