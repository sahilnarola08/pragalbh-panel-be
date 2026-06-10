import Sku from "../models/sku.js";

export async function getSkuDashboardStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    totalSkus,
    todayGenerated,
    categoryAgg,
    metalAgg,
    collectionAgg,
    growthAgg,
  ] = await Promise.all([
    Sku.countDocuments({ isDeleted: false, previewOnly: false }),
    Sku.countDocuments({
      isDeleted: false,
      previewOnly: false,
      createdAt: { $gte: startOfDay },
    }),
    Sku.aggregate([
      { $match: { isDeleted: false, previewOnly: false, category: { $ne: null } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Sku.aggregate([
      { $match: { isDeleted: false, previewOnly: false, metal: { $ne: null } } },
      { $group: { _id: "$metal", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Sku.aggregate([
      { $match: { isDeleted: false, previewOnly: false, collectionCode: { $ne: null } } },
      { $group: { _id: "$collectionCode", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Sku.aggregate([
      {
        $match: {
          isDeleted: false,
          previewOnly: false,
          createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
  ]);

  return {
    totalSkus,
    todayGenerated,
    duplicateAttemptsPrevented: 0,
    topCategories: categoryAgg.map((r) => ({ code: r._id, count: r.count })),
    topMetals: metalAgg.map((r) => ({ code: r._id, count: r.count })),
    topCollections: collectionAgg.map((r) => ({ code: r._id, count: r.count })),
    growthChart: growthAgg.map((r) => ({
      year: r._id.year,
      month: r._id.month,
      count: r.count,
      label: `${r._id.year}-${String(r._id.month).padStart(2, "0")}`,
    })),
  };
}
