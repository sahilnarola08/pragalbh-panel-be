import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../src/models/order.js';
import Payment from '../src/models/payment.js';
import ExpanseIncome from '../src/models/expance_inc.js';
import { getOrderProfitSummary, getOrderProfitSummaryBulk } from '../src/services/orderProfitService.js';
import { PAYMENT_LIFECYCLE_STATUS } from '../src/helper/enums.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const runTest = async () => {
  await connectDB();

  try {
    console.log('--- TEST: Order Profit Soft Delete Logic ---');

    // 1. Create Active Order
    const dummyPlatformId = new mongoose.Types.ObjectId();
    const order1 = await Order.create({
      clientName: "Test Client Active",
      address: "123 Test St",
      products: [{ 
          productName: "P1", 
          sellingPrice: 100, 
          purchasePrice: 50,
          orderDate: new Date(),
          dispatchDate: new Date(),
          orderPlatform: dummyPlatformId
      }],
      status: "pending"
    });
    console.log('Created Active Order:', order1._id);

    // 2. Create Active Payment for Order 1
    const dummyMediatorId = new mongoose.Types.ObjectId();
    const payment1 = await Payment.create({
      orderId: order1._id,
      grossAmountUSD: 100,
      paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
      actualBankCreditINR: 8000,
      expectedAmountINR: 8000,
      conversionRate: 80,
      mediatorId: dummyMediatorId
    });
    console.log('Created Active Payment for Order 1');

    // 3. Create Deleted Payment for Order 1 (Simulate mistake)
    const payment1_deleted = await Payment.create({
      orderId: order1._id,
      grossAmountUSD: 50,
      paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
      actualBankCreditINR: 4000,
      isDeleted: true,
      mediatorId: dummyMediatorId
    });
    console.log('Created DELETED Payment for Order 1');

    // 4. Create Order to be Deleted
    const order2 = await Order.create({
      clientName: "Test Client Deleted",
      address: "456 Deleted St",
      products: [{ 
          productName: "P2", 
          sellingPrice: 200, 
          purchasePrice: 100,
          orderDate: new Date(),
          dispatchDate: new Date(),
          orderPlatform: dummyPlatformId
      }],
      status: "pending"
    });
    console.log('Created Order 2 (to be deleted):', order2._id);

    // 5. Create Payment for Order 2 (initially active)
    const payment2 = await Payment.create({
      orderId: order2._id,
      grossAmountUSD: 200,
      paymentStatus: PAYMENT_LIFECYCLE_STATUS.CREDITED_TO_BANK,
      actualBankCreditINR: 16000,
      expectedAmountINR: 16000,
      conversionRate: 80,
      mediatorId: dummyMediatorId
    });
    console.log('Created Payment for Order 2');

    // 6. Soft Delete Order 2 and its Payment (Simulate Cascade)
    await Order.findByIdAndUpdate(order2._id, { isDeleted: true });
    await Payment.findByIdAndUpdate(payment2._id, { isDeleted: true });
    console.log('Soft Deleted Order 2 and Payment 2');

    // --- VERIFICATION ---

    // A. Verify Single Order Profit
    console.log('\n--- Verify Single Order Profit ---');
    
    // Order 1 (Active): Should see payment1 (8000), NOT payment1_deleted
    const summary1 = await getOrderProfitSummary(order1._id);
    console.log('Order 1 (Active) Total Actual INR:', summary1.totalActualINR);
    if (summary1.totalActualINR === 8000) {
      console.log('SUCCESS: Active Order excludes deleted payment.');
    } else {
      console.log('FAILURE: Active Order total is', summary1.totalActualINR, 'expected 8000');
    }

    // Order 2 (Deleted): Should see payment2 (16000) even though it is deleted
    const summary2 = await getOrderProfitSummary(order2._id);
    console.log('Order 2 (Deleted) Total Actual INR:', summary2.totalActualINR);
    if (summary2.totalActualINR === 16000) {
      console.log('SUCCESS: Deleted Order includes deleted payment.');
    } else {
      console.log('FAILURE: Deleted Order total is', summary2.totalActualINR, 'expected 16000');
    }

    // B. Verify Bulk Profit Summary
    console.log('\n--- Verify Bulk Profit Summary ---');
    const bulkMap = await getOrderProfitSummaryBulk([order1._id, order2._id]);
    
    const res1 = bulkMap.get(String(order1._id));
    const res2 = bulkMap.get(String(order2._id));

    console.log('Bulk Order 1:', res1?.totalActualINR);
    console.log('Bulk Order 2:', res2?.totalActualINR);

    if (res1?.totalActualINR === 8000 && res2?.totalActualINR === 16000) {
      console.log('SUCCESS: Bulk Summary handles mixed active/deleted orders correctly.');
    } else {
      console.log('FAILURE: Bulk Summary incorrect.');
    }

    // Cleanup
    await Order.deleteMany({ _id: { $in: [order1._id, order2._id] } });
    await Payment.deleteMany({ _id: { $in: [payment1._id, payment1_deleted._id, payment2._id] } });
    console.log('\nCleanup done.');

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await mongoose.disconnect();
  }
};

runTest();
