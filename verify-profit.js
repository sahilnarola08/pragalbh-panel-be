import mongoose from "mongoose";
import "dotenv/config";
import Order from "./src/models/order.js";
import ExpanseIncome from "./src/models/expance_inc.js";
import { getOrderProfitSummary, getOrderProfitSummaryBulk } from "./src/services/orderProfitService.js";
import connectDB from "./src/config/db.js";

async function testProfit() {
  await connectDB();
  console.log("Connected to DB");

  // Create Dummy Order
  const order = await Order.create({
    clientName: "Test Client",
    address: "Test Address",
    products: [
      {
        productName: "Test Product",
        orderDate: new Date(),
        dispatchDate: new Date(),
        purchasePrice: 1000,
        sellingPrice: 2000,
        orderPlatform: new mongoose.Types.ObjectId(),
      }
    ],
    shippingCost: 100,
  });
  console.log("Order created:", order._id);

  // Initial Check (No Expenses)
  // Since no supplier, ExpanseIncome is NOT created automatically in createOrder (based on my reading).
  // But let's check.
  let profit = await getOrderProfitSummary(order._id);
  console.log("Initial Profit (No ExpenseIncome):");
  console.log("  Purchase Price (Order):", profit.purchasePrice);
  console.log("  Total Expenses:", profit.totalExpenses);
  console.log("  Net Profit:", profit.netProfit);
  // Expected: Expenses = 1000 (Purchase) + 100 (Shipping) = 1100.
  // Profit = 0 (Revenue) - 1100 = -1100.

  // Add ExpenseIncome (Simulating Purchase Price Payment)
  await ExpanseIncome.create({
    orderId: order._id,
    description: "Test Product",
    paidAmount: 0,
    dueAmount: 1000,
    status: "pending",
  });
  console.log("Added Purchase Price Expense (1000)");

  profit = await getOrderProfitSummary(order._id);
  console.log("Profit after Purchase Expense:");
  console.log("  Total Expenses:", profit.totalExpenses);
  // Expected: Expenses = 1000 (Expense) + 100 (Shipping) = 1100.
  // It should NOT be 2100 (1000 Order + 1000 Expense + 100 Shipping).

  // Add Extra Expense (Simulating Repair Cost)
  await ExpanseIncome.create({
    orderId: order._id,
    description: "Repair",
    paidAmount: 200,
    dueAmount: 0,
    status: "paid",
  });
  console.log("Added Repair Expense (200)");

  profit = await getOrderProfitSummary(order._id);
  console.log("Profit after Repair Expense:");
  console.log("  Total Expenses:", profit.totalExpenses);
  // Expected: Expenses = 1000 (Purchase Expense) + 200 (Repair) + 100 (Shipping) = 1300.

  // Test Bulk
  const bulk = await getOrderProfitSummaryBulk([order._id]);
  const bulkProfit = bulk.get(String(order._id));
  console.log("Bulk Profit Check:");
  console.log("  Total Expenses:", bulkProfit.totalExpenses);

  // Cleanup
  await Order.findByIdAndDelete(order._id);
  await ExpanseIncome.deleteMany({ orderId: order._id });
  console.log("Cleanup done");
  process.exit(0);
}

testProfit();
