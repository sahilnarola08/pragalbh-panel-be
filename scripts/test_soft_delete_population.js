
import mongoose from 'mongoose';
import Master from '../src/models/master.js';
import ExpanceIncome from '../src/models/expance_inc.js';
import Payment from '../src/models/payment.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Defined' : 'Undefined');

const run = async () => {
  if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL is missing');
      return;
  }

  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to DB');

    // 1. Create a Bank
    const bank = await Master.create({
      name: 'Test Bank ' + Date.now(),
      master: new mongoose.Types.ObjectId(), // dummy master asset id
      isActive: true,
      isDeleted: false
    });
    console.log('Created Bank:', bank._id);

    // 2. Create an Expense linked to it
    const expense = await ExpanceIncome.create({
        date: new Date(),
        description: 'Test Expense',
        dueAmount: 100,
        paidAmount: 0,
        bankId: bank._id,
        status: 'paid' // Use 'paid' as per schema enum if strict
    });
    console.log('Created Expense:', expense._id);

    // 3. Soft delete the Bank
    await Master.findByIdAndUpdate(bank._id, { isDeleted: true });
    console.log('Soft deleted Bank');

    // 4. Fetch the Expense and populate bankId
    const fetchedExpense = await ExpanceIncome.findById(expense._id)
      .populate('bankId', '_id name')
      .lean();

    console.log('Fetched Expense Bank:', fetchedExpense.bankId);

    if (fetchedExpense.bankId) {
        console.log('SUCCESS: Bank populated in Expense even though isDeleted: true');
    } else {
        console.log('FAILURE: Bank NOT populated in Expense');
    }

    // --- TEST 2: Payment -> Bank ---
    console.log('\n--- TEST 2: Payment -> Bank ---');
    const payment = await Payment.create({
        orderId: new mongoose.Types.ObjectId(), // dummy order
        grossAmountUSD: 100,
        mediatorId: new mongoose.Types.ObjectId(), // dummy mediator
        bankId: bank._id, // Deleted bank
        paymentStatus: 'pending_with_mediator'
    });
    
    const fetchedPayment = await Payment.findById(payment._id)
        .populate('bankId', '_id name')
        .lean();

    console.log('Fetched Payment Bank:', fetchedPayment.bankId);
    if (fetchedPayment.bankId) {
        console.log('SUCCESS: Bank populated in Payment');
    } else {
        console.log('FAILURE: Bank NOT populated in Payment');
    }

    // Cleanup
    await ExpanceIncome.findByIdAndDelete(expense._id);
    await Payment.findByIdAndDelete(payment._id);
    await Master.findByIdAndDelete(bank._id);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
