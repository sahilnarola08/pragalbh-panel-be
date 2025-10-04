import Income from "../models/income.js";
import ExpanceIncome from "../models/expance_inc.js";

export const getIncomeExpance = async (req, res) => {
  try {
    let {
      incExpType = 3,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;
    const sortQuery = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const searchQuery = search
      ? {
          $or: [
            { Description: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    let data = [];
    let total = 0;

    // Case 1: Income Only
    if (incExpType == 1) {
      const incomeData = await Income.find(searchQuery)
        .populate("orderId", "product clientName sellingPrice orderId")
        .populate("clientId", "firstName lastName")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit);

      const count = await Income.countDocuments(searchQuery);

      data = incomeData.map((item) => ({
        incExpType: 1,
        date: item.date,
        orderId: item.orderId,
        description: item.Description || item.orderId?.product || "",
        product: item.orderId?.product || "",
        sellingPrice: item.orderId?.sellingPrice || item.sellingPrice || 0,
        receivedAmount: item.receivedAmount || 0,
        clientName:
          item.orderId?.clientName ||
          `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.trim(),
        status: item.status,
      }));

      total = count;
    }

    // Case 2: Expense Only
    else if (incExpType == 2) {
      const expanceData = await ExpanceIncome.find(searchQuery)
        .populate("orderId", "product clientName purchasePrice orderId")
        .populate("supplierId", "firstName lastName company")
        .sort(sortQuery)
        .skip(skip)
        .limit(limit);

      const count = await ExpanceIncome.countDocuments(searchQuery);
      data = expanceData.map((item) => ({
        incExpType: 2,
        date: item.createdAt,
        orderId: item.orderId,
        description: item.description || item.orderId?.product || "",
        dueAmount: item.orderId?.purchasePrice || 0,
        clientName: item.orderId?.clientName || "",
        paidAmount: item.paidAmount || 0,
        supplierName:
          `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
          item.supplierId?.company ||
          "",
        status: item.status,
      }));

      total = count;
    }

    // Case 3: Income + Expense Both
    else if (incExpType == 3) {
      const [incomeData, expanceData] = await Promise.all([
        Income.find(searchQuery)
          .populate("orderId", "product clientName sellingPrice orderId")
          .populate("clientId", "firstName lastName")
          .sort(sortQuery),
        ExpanceIncome.find(searchQuery)
          .populate("orderId", "product clientName purchasePrice orderId")
          .populate("supplierId", "firstName lastName company")
          .sort(sortQuery),
      ]);

      const incomeList = incomeData.map((item) => ({
        incExpType: 1,
        date: item.date,
        orderId: item.orderId,
        description: item.Description || item.orderId?.product || "",
        product: item.orderId?.product || "",
        sellingPrice: item.orderId?.sellingPrice || item.sellingPrice || 0,
        receivedAmount: item.receivedAmount || 0,
        clientName:
          item.orderId?.clientName ||
          `${item.clientId?.firstName || ""} ${item.clientId?.lastName || ""}`.trim(),
        status: item.status,
      }));

      const expanceList = expanceData.map((item) => ({
        incExpType: 2,
        date: item.createdAt,
        orderId: item.orderId,
        description: item.description || item.orderId?.product || "",
        dueAmount: item.orderId?.purchasePrice || 0,
        clientName: item.orderId?.clientName || "",
        supplierName:
          `${item.supplierId?.firstName || ""} ${item.supplierId?.lastName || ""}`.trim() ||
          item.supplierId?.company ||
          "",
        status: item.status,
      }));

      const merged = [...incomeList, ...expanceList].sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        return sortOrder === "asc" ? da - db : db - da;
      });
      
      total = merged.length;
      data = merged.slice(skip, skip + limit);
    }

    res.status(200).json({
      status: 200,
      message: "Income and Expense fetched successfully",
      data: {
        total,
        page,
        limit,
        items: data,
      },
    });
  } catch (error) {
    console.error("Error fetching income and expance:", error);
    res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

export default { getIncomeExpance };
