import mongoose from "mongoose";
import Partner from "../models/partner.js";
import PartnerTransaction, { TRANSACTION_TYPES } from "../models/partnerTransaction.js";
import Income from "../models/income.js";
import ExpanseIncome from "../models/expance_inc.js";
import ManualBankEntry from "../models/manualBankEntry.js";
import Master from "../models/master.js";
import { PAYMENT_STATUS } from "../helper/enums.js";
import { invalidateCache } from "../util/cacheHelper.js";

const roundAmount = (value) => Math.round((Number(value) || 0) * 100) / 100;

async function normalizeBankIdOrThrow(bankId) {
  if (!bankId) return null;
  const rawId =
    typeof bankId === "object" && bankId !== null
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
}

function buildWithdrawExpenseDescription(partnerName, body) {
  const parts = [`Partner Withdrawal - ${partnerName}`];
  if (body.referenceNumber && String(body.referenceNumber).trim()) {
    parts.push(`Ref: ${String(body.referenceNumber).trim()}`);
  }
  if (body.notes && String(body.notes).trim()) {
    parts.push(String(body.notes).trim());
  }
  return parts.join(". ");
}

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
 * When paymentMode is "bank", bankId is required and funds are credited via ManualBankEntry (deposit)
 * so Bank Accounts / Payments ledger matches the inflow.
 */
export async function invest(partnerId, body, createdBy = null) {
  const amount = Number(body.amount);
  if (amount <= 0) {
    const err = new Error("Amount must be greater than 0");
    err.status = 400;
    throw err;
  }
  const paymentMode = body.paymentMode || "cash";
  let normalizedBankId = null;
  if (paymentMode === "bank") {
    if (!body.bankId) {
      const err = new Error("Company bank account is required for bank investments");
      err.status = 400;
      throw err;
    }
    normalizedBankId = await normalizeBankIdOrThrow(body.bankId);
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
    const investmentDescription = `Partner Investment - ${partner.name}`;
    const detailParts = [];
    if (body.referenceNumber && String(body.referenceNumber).trim()) {
      detailParts.push(`Ref: ${String(body.referenceNumber).trim()}`);
    }
    if (body.notes && String(body.notes).trim()) {
      detailParts.push(String(body.notes).trim());
    }
    const depositDescription = detailParts.length
      ? `${investmentDescription}. ${detailParts.join(". ")}`
      : investmentDescription;

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

    const [incomeRow] = await Income.create(
      [
        {
          date: transactionDate,
          Description: investmentDescription,
          receivedAmount: amount,
          sellingPrice: amount,
          initialPayment: 0,
          status: PAYMENT_STATUS.RESERVED,
          ...(normalizedBankId
            ? { bankId: normalizedBankId, isBankReceived: true }
            : {}),
        },
      ],
      { session }
    );

    let manualBankEntryId = null;
    if (normalizedBankId) {
      const [me] = await ManualBankEntry.create(
        [
          {
            type: "deposit",
            date: transactionDate,
            amount,
            description: depositDescription,
            bankId: normalizedBankId,
          },
        ],
        { session }
      );
      manualBankEntryId = me._id;
    }

    await PartnerTransaction.create(
      [
        {
          partnerId: new mongoose.Types.ObjectId(partnerId),
          type: "investment",
          amount,
          balanceAfterTransaction: newBalance,
          paymentMode,
          bankId: normalizedBankId || undefined,
          manualBankEntryId: manualBankEntryId || undefined,
          linkedIncomeId: incomeRow._id,
          referenceNumber: body.referenceNumber || "",
          notes: body.notes || "",
          transactionDate,
          createdBy: createdBy || null,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    if (normalizedBankId) {
      invalidateCache("income");
      invalidateCache("dashboard");
    }
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
  const amount = roundAmount(body.amount);
  if (amount <= 0) {
    const err = new Error("Amount must be greater than 0");
    err.status = 400;
    throw err;
  }
  const paymentMode = body.paymentMode || "cash";
  let normalizedBankId = null;
  if (paymentMode === "bank") {
    normalizedBankId = await normalizeBankIdOrThrow(body.bankId);
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
    const current = roundAmount(partner.currentBalance ?? 0);
    // Partner wallet may go negative when ops pays out from bank before ledger is topped up; UI warns only.
    const newBalance = roundAmount(current - amount);
    const newTotalWithdrawn = roundAmount((partner.totalWithdrawn || 0) + amount);
    const transactionDate = body.transactionDate ? new Date(body.transactionDate) : new Date();
    const expenseDescription = buildWithdrawExpenseDescription(partner.name, body);

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

    let linkedFields = {
      bankId: null,
      manualBankEntryId: null,
      linkedExpenseId: null,
    };

    if (paymentMode === "bank") {
      const [manualEntry] = await ManualBankEntry.create(
        [
          {
            type: "withdrawal",
            date: transactionDate,
            amount,
            description: expenseDescription,
            bankId: normalizedBankId,
          },
        ],
        { session }
      );
      const [expense] = await ExpanseIncome.create(
        [
          {
            date: transactionDate,
            description: expenseDescription,
            paidAmount: amount,
            dueAmount: 0,
            bankId: normalizedBankId,
            status: PAYMENT_STATUS.PAID,
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
      linkedFields = {
        bankId: normalizedBankId,
        manualBankEntryId: manualEntry._id,
        linkedExpenseId: expense._id,
      };
    } else {
      const [expense] = await ExpanseIncome.create(
        [
          {
            date: transactionDate,
            description: expenseDescription,
            paidAmount: amount,
            dueAmount: 0,
            status: PAYMENT_STATUS.PAID,
          },
        ],
        { session }
      );
      linkedFields = {
        bankId: null,
        manualBankEntryId: null,
        linkedExpenseId: expense._id,
      };
    }

    await PartnerTransaction.create(
      [
        {
          partnerId: new mongoose.Types.ObjectId(partnerId),
          type: "withdrawal",
          amount,
          balanceAfterTransaction: newBalance,
          paymentMode,
          referenceNumber: body.referenceNumber || "",
          notes: body.notes || "",
          transactionDate,
          createdBy: createdBy || null,
          ...linkedFields,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    invalidateCache("income");
    invalidateCache("dashboard");
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
 * @param {Object} options - { page, limit, deletedOnly }
 * deletedOnly: if true, returns only soft-deleted transactions; otherwise excludes deleted.
 */
export async function getTransactions(partnerId, { page = 1, limit = 20, deletedOnly = false } = {}) {
  const exists = await Partner.findById(partnerId).select("_id").lean();
  if (!exists) {
    const err = new Error("Partner not found");
    err.status = 404;
    throw err;
  }
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const deletedFilter = deletedOnly ? { isDeleted: true } : { isDeleted: { $ne: true } };
  const query = { partnerId, ...deletedFilter };
  const [transactions, totalCount] = await Promise.all([
    PartnerTransaction.find(query)
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Math.max(1, limit))
      .populate("bankId", "name")
      .lean(),
    PartnerTransaction.countDocuments(query),
  ]);
  return { transactions, totalCount };
}

/**
 * Recalculate partner totals and all transaction balanceAfterTransaction from non-deleted transactions.
 */
async function recalculatePartnerBalances(partnerId, session) {
  const partner = await Partner.findById(partnerId).session(session);
  if (!partner) return;

  const txs = await PartnerTransaction.find({ partnerId, isDeleted: { $ne: true } })
    .sort({ transactionDate: 1, createdAt: 1 })
    .session(session)
    .lean();

  let runningBalance = partner.openingBalance ?? 0;
  let totalInvested = 0;
  let totalWithdrawn = 0;

  for (const t of txs) {
    const amount = Number(t.amount) || 0;
    if (t.type === "investment") {
      runningBalance += amount;
      totalInvested += amount;
    } else if (t.type === "withdrawal") {
      runningBalance -= amount;
      totalWithdrawn += amount;
    } else if (t.type === "adjustment") {
      runningBalance += amount; // adjustment amount can be + or -
    }
    await PartnerTransaction.updateOne(
      { _id: t._id },
      { $set: { balanceAfterTransaction: Math.round(runningBalance * 100) / 100 } },
      { session }
    );
  }

  await Partner.updateOne(
    { _id: partnerId },
    {
      $set: {
        currentBalance: Math.round(runningBalance * 100) / 100,
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
      },
    },
    { session }
  );
}

/**
 * Soft delete a partner transaction and recalculate all related entries.
 */
export async function softDeleteTransaction(partnerId, transactionId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const tx = await PartnerTransaction.findOne({ _id: transactionId, partnerId }).session(session);
    if (!tx) {
      const err = new Error("Transaction not found");
      err.status = 404;
      throw err;
    }
    if (tx.isDeleted) {
      const err = new Error("Transaction is already deleted");
      err.status = 400;
      throw err;
    }
    const manualBankEntryId = tx.manualBankEntryId || null;
    const linkedExpenseId = tx.linkedExpenseId || null;
    const linkedIncomeId = tx.linkedIncomeId || null;

    tx.isDeleted = true;
    tx.deletedAt = new Date();
    await tx.save({ session });

    await recalculatePartnerBalances(partnerId, session);

    if (manualBankEntryId) {
      await ManualBankEntry.updateOne(
        { _id: manualBankEntryId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { session }
      );
    }
    if (linkedExpenseId) {
      await ExpanseIncome.updateOne(
        { _id: linkedExpenseId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { session }
      );
    }
    if (linkedIncomeId) {
      await Income.updateOne(
        { _id: linkedIncomeId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: new Date() } },
        { session }
      );
    }

    await session.commitTransaction();
    if (manualBankEntryId || linkedExpenseId || linkedIncomeId) {
      invalidateCache("income");
      invalidateCache("dashboard");
    }
    const saved = await PartnerTransaction.findById(transactionId).lean();
    return saved;
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
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
