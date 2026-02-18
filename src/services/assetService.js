import mongoose from "mongoose";
import Asset from "../models/asset.js";
import AssetHistory from "../models/assetHistory.js";
import Partner from "../models/partner.js";
import PartnerTransaction from "../models/partnerTransaction.js";

const toPlain = (doc) => {
  if (!doc) return doc;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
};

async function createHistory({ session, assetId, actionType, changedBy, oldData, newData }) {
  await AssetHistory.create(
    [
      {
        assetId: new mongoose.Types.ObjectId(assetId),
        actionType,
        changedBy: changedBy || null,
        oldData: oldData ?? null,
        newData: newData ?? null,
        timestamp: new Date(),
      },
    ],
    { session }
  );
}

async function applyOptionalCapitalUpdate({ session, partnerId, amount, note, changedBy }) {
  if (!partnerId || !mongoose.Types.ObjectId.isValid(partnerId)) return;
  const value = Number(amount || 0);
  if (!value || value <= 0) return;

  const partner = await Partner.findById(partnerId).session(session);
  if (!partner) return;

  const newBalance = (partner.currentBalance || 0) + value;
  const newTotalInvested = (partner.totalInvested || 0) + value;

  await Partner.updateOne(
    { _id: partnerId },
    { $set: { currentBalance: newBalance, totalInvested: newTotalInvested, updatedAt: new Date() } },
    { session }
  );

  await PartnerTransaction.create(
    [
      {
        partnerId: new mongoose.Types.ObjectId(partnerId),
        type: "investment",
        amount: value,
        balanceAfterTransaction: newBalance,
        paymentMode: "cash",
        referenceNumber: "",
        notes: note || "Asset contribution",
        transactionDate: new Date(),
        createdBy: changedBy || null,
      },
    ],
    { session }
  );
}

export async function listAssets({
  page = 1,
  limit = 10,
  search = "",
  ownershipType,
  partnerId,
  status,
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const query = { isDeleted: false };
  if (ownershipType) query.ownershipType = ownershipType;
  if (status) query.status = status;
  if (partnerId && mongoose.Types.ObjectId.isValid(partnerId)) {
    query.$or = [
      { ownerPartnerId: partnerId },
      { originalOwnerPartnerId: partnerId },
      { purchasedByPartnerId: partnerId },
    ];
  }
  if (search && search.trim()) {
    const s = search.trim();
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { name: { $regex: s, $options: "i" } },
        { location: { $regex: s, $options: "i" } },
        { notes: { $regex: s, $options: "i" } },
      ],
    });
  }

  const [items, totalCount] = await Promise.all([
    Asset.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate([{ path: "typeId", select: "name" }, { path: "categoryId", select: "name" }])
      .populate([{ path: "ownerPartnerId", select: "name email phone" }, { path: "originalOwnerPartnerId", select: "name email phone" }, { path: "purchasedByPartnerId", select: "name email phone" }])
      .lean(),
    Asset.countDocuments(query),
  ]);

  return { items, totalCount, page: pageNum, limit: limitNum };
}

export async function getAssetById(id) {
  const asset = await Asset.findOne({ _id: id, isDeleted: false })
    .populate([{ path: "typeId", select: "name" }, { path: "categoryId", select: "name" }])
    .populate([{ path: "ownerPartnerId", select: "name email phone" }, { path: "originalOwnerPartnerId", select: "name email phone" }, { path: "purchasedByPartnerId", select: "name email phone" }])
    .lean();
  if (!asset) {
    const err = new Error("Asset not found");
    err.status = 404;
    throw err;
  }
  return asset;
}

export async function createAsset(payload, changedBy = null) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const doc = await Asset.create(
      [
        {
          name: payload.name,
          typeId: payload.typeId || null,
          categoryId: payload.categoryId || null,
          ownershipType: payload.ownershipType,
          ownerPartnerId: payload.ownerPartnerId || null,
          originalOwnerPartnerId: payload.originalOwnerPartnerId || null,
          contributionDate: payload.contributionDate || null,
          contributionValue: payload.contributionValue || 0,
          purchaseDate: payload.purchaseDate || null,
          purchaseCost: payload.purchaseCost || 0,
          currentValue: payload.currentValue ?? payload.contributionValue ?? payload.purchaseCost ?? 0,
          purchaseFundingSource: payload.purchaseFundingSource || "company",
          purchasedByPartnerId: payload.purchasedByPartnerId || null,
          status: payload.status || "active",
          location: payload.location || "",
          notes: payload.notes || "",
          documents: payload.documents || [],
          isDeleted: false,
        },
      ],
      { session }
    );

    const asset = doc[0];

    await createHistory({
      session,
      assetId: asset._id,
      actionType: "create",
      changedBy,
      oldData: null,
      newData: toPlain(asset),
    });

    if (payload.ownershipType === "contributed" && payload.autoCapitalUpdate) {
      await applyOptionalCapitalUpdate({
        session,
        partnerId: payload.originalOwnerPartnerId,
        amount: payload.contributionValue,
        note: `Asset contributed: ${payload.name}`,
        changedBy,
      });
    }

    await session.commitTransaction();
    return await getAssetById(asset._id);
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function updateAsset(id, payload, changedBy = null) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existing = await Asset.findOne({ _id: id, isDeleted: false }).session(session);
    if (!existing) {
      const err = new Error("Asset not found");
      err.status = 404;
      throw err;
    }
    const oldData = toPlain(existing);

    const update = {
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.typeId !== undefined && { typeId: payload.typeId || null }),
      ...(payload.categoryId !== undefined && { categoryId: payload.categoryId || null }),
      ...(payload.status !== undefined && { status: payload.status }),
      ...(payload.location !== undefined && { location: payload.location }),
      ...(payload.notes !== undefined && { notes: payload.notes }),
      ...(payload.currentValue !== undefined && { currentValue: payload.currentValue }),
      ...(payload.documents !== undefined && { documents: payload.documents }),
    };

    const updated = await Asset.findByIdAndUpdate(id, update, { new: true }).session(session);

    const newData = toPlain(updated);

    let actionType = "update";
    if (payload.status !== undefined && payload.status !== oldData.status) actionType = "status_change";
    if (payload.currentValue !== undefined && payload.currentValue !== oldData.currentValue) actionType = "value_update";

    await createHistory({
      session,
      assetId: id,
      actionType,
      changedBy,
      oldData,
      newData,
    });

    await session.commitTransaction();
    return await getAssetById(id);
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function changeOwnership(id, payload, changedBy = null) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existing = await Asset.findOne({ _id: id, isDeleted: false }).session(session);
    if (!existing) {
      const err = new Error("Asset not found");
      err.status = 404;
      throw err;
    }
    const oldData = toPlain(existing);

    const update = {
      ownershipType: payload.ownershipType,
      ownerPartnerId: payload.ownerPartnerId || null,
      originalOwnerPartnerId: payload.originalOwnerPartnerId || null,
      contributionDate: payload.contributionDate || null,
      contributionValue: payload.contributionValue || 0,
      purchaseDate: payload.purchaseDate || null,
      purchaseCost: payload.purchaseCost || 0,
      purchaseFundingSource: payload.purchaseFundingSource || "company",
      purchasedByPartnerId: payload.purchasedByPartnerId || null,
    };

    if (payload.ownershipType === "company") {
      update.ownerPartnerId = null;
      update.originalOwnerPartnerId = null;
      update.contributionDate = null;
      update.contributionValue = 0;
    }

    if (payload.ownershipType === "individual") {
      update.originalOwnerPartnerId = null;
      update.contributionDate = null;
      update.contributionValue = 0;
      update.purchaseDate = null;
      update.purchaseCost = 0;
      update.purchaseFundingSource = "company";
      update.purchasedByPartnerId = null;
    }

    const updated = await Asset.findByIdAndUpdate(id, update, { new: true }).session(session);
    const newData = toPlain(updated);

    await createHistory({
      session,
      assetId: id,
      actionType: "ownership_change",
      changedBy,
      oldData,
      newData,
    });

    if (payload.ownershipType === "contributed" && payload.autoCapitalUpdate) {
      await applyOptionalCapitalUpdate({
        session,
        partnerId: payload.originalOwnerPartnerId,
        amount: payload.contributionValue,
        note: `Asset contributed: ${updated.name}`,
        changedBy,
      });
    }

    await session.commitTransaction();
    return await getAssetById(id);
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function updateValue(id, payload, changedBy = null) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existing = await Asset.findOne({ _id: id, isDeleted: false }).session(session);
    if (!existing) {
      const err = new Error("Asset not found");
      err.status = 404;
      throw err;
    }
    const oldData = toPlain(existing);
    const updated = await Asset.findByIdAndUpdate(
      id,
      { $set: { currentValue: payload.currentValue, updatedAt: new Date() } },
      { new: true }
    ).session(session);

    const newData = toPlain(updated);

    await createHistory({
      session,
      assetId: id,
      actionType: "value_update",
      changedBy,
      oldData,
      newData: { ...newData, _note: payload.notes || "" },
    });

    await session.commitTransaction();
    return await getAssetById(id);
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function softDelete(id, changedBy = null) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existing = await Asset.findOne({ _id: id, isDeleted: false }).session(session);
    if (!existing) {
      const err = new Error("Asset not found");
      err.status = 404;
      throw err;
    }
    const oldData = toPlain(existing);
    const updated = await Asset.findByIdAndUpdate(id, { $set: { isDeleted: true, updatedAt: new Date() } }, { new: true }).session(session);
    const newData = toPlain(updated);

    await createHistory({
      session,
      assetId: id,
      actionType: "delete",
      changedBy,
      oldData,
      newData,
    });

    await session.commitTransaction();
    return { ok: true };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function getHistory(assetId, { page = 1, limit = 30 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 30);
  const skip = (pageNum - 1) * limitNum;
  const [items, totalCount] = await Promise.all([
    AssetHistory.find({ assetId }).sort({ timestamp: -1 }).skip(skip).limit(limitNum).lean(),
    AssetHistory.countDocuments({ assetId }),
  ]);
  return { items, totalCount, page: pageNum, limit: limitNum };
}

export async function getContributionSummary() {
  // Total contributed value per partner (contributed ownership only)
  const rows = await Asset.aggregate([
    { $match: { isDeleted: false, ownershipType: "contributed" } },
    {
      $group: {
        _id: "$originalOwnerPartnerId",
        totalContributedValue: { $sum: { $ifNull: ["$contributionValue", 0] } },
        assetCount: { $sum: 1 },
      },
    },
    { $sort: { totalContributedValue: -1 } },
  ]);

  const partnerIds = rows.map((r) => r._id).filter(Boolean);
  const partners = await Partner.find({ _id: { $in: partnerIds } }).select("name email phone").lean();
  const partnerMap = new Map(partners.map((p) => [p._id.toString(), p]));

  return rows.map((r) => ({
    partner: r._id ? partnerMap.get(r._id.toString()) || null : null,
    partnerId: r._id || null,
    totalContributedValue: r.totalContributedValue || 0,
    assetCount: r.assetCount || 0,
  }));
}

export async function getOwnershipDistribution() {
  const rows = await Asset.aggregate([
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: "$ownershipType",
        count: { $sum: 1 },
        totalCurrentValue: { $sum: { $ifNull: ["$currentValue", 0] } },
      },
    },
  ]);
  const byType = {};
  for (const r of rows) {
    byType[r._id] = { count: r.count || 0, totalCurrentValue: r.totalCurrentValue || 0 };
  }
  return byType;
}

