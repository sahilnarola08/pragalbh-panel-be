/**
 * Central definition of modules, tables, and columns for column-level permissions.
 * Used by admin UI and getVisibleColumns logic.
 * If a module/table is not listed here, column permissions do not apply (all columns shown).
 */
export const TABLE_COLUMN_DEFINITIONS = {
  orders: {
    order_list: {
      label: "Order List",
      columns: [
        { id: "_id", label: "Order ID" },
        { id: "clientName", label: "Client Name" },
        { id: "product", label: "Product" },
        { id: "orderPlatform", label: "Platform" },
        { id: "purchasePrice", label: "Purchase Price (₹)" },
        { id: "sellingPrice", label: "Selling Price (₹)" },
        { id: "netProfit", label: "Net Profit (₹)" },
        { id: "paymentStatus", label: "Payment Status" },
        { id: "supplier", label: "Supplier" },
        { id: "orderDate", label: "Order Date" },
        { id: "dispatchDate", label: "Dispatch Date" },
        { id: "financial", label: "₹ (Payment)" },
        { id: "select", label: "Select (Bulk Delete)" },
      ],
    },
  },
  user: {
    customer_list: {
      label: "Customer List",
      columns: [
        { id: "fullName", label: "Customer" },
        { id: "email", label: "Email" },
        { id: "contactNumber", label: "Phone" },
        { id: "address", label: "Address" },
      ],
    },
  },
  supplier: {
    supplier_list: {
      label: "Supplier List",
      columns: [
        { id: "fullName", label: "Full Name" },
        { id: "company", label: "Company" },
        { id: "contactNumber", label: "Contact" },
        { id: "advancePayment", label: "Advance Payment" },
        { id: "pendingPayment", label: "Pending Payment" },
        { id: "address", label: "Address" },
        { id: "orderDetails", label: "₹ (Order Details)" },
      ],
    },
  },
  product: {
    product_list: {
      label: "Product List",
      columns: [
        { id: "_id", label: "Product ID" },
        { id: "image", label: "Image" },
        { id: "productName", label: "Product Name" },
        { id: "category", label: "Category" },
        { id: "createdAt", label: "Created Date" },
        { id: "updatedAt", label: "Updated Date" },
      ],
    },
  },
  expense: {
    expense_list: {
      label: "Expense List",
      columns: [
        { id: "date", label: "Date" },
        { id: "description", label: "Description" },
        { id: "amount", label: "Amount" },
        { id: "status", label: "Status" },
      ],
    },
  },
  payment: {
    payment_list: {
      label: "Payment List",
      columns: [
        { id: "orderId", label: "Order" },
        { id: "grossAmountUSD", label: "Gross (USD)" },
        { id: "paymentStatus", label: "Status" },
        { id: "expectedAmountINR", label: "Expected (₹)" },
      ],
    },
  },
  master: {
    master_list: {
      label: "Master List",
      columns: [
        { id: "name", label: "Name" },
        { id: "type", label: "Type" },
        { id: "description", label: "Description" },
      ],
    },
  },
  assets: {
    asset_list: {
      label: "Asset List",
      columns: [
        { id: "name", label: "Name" },
        { id: "value", label: "Value" },
        { id: "owner", label: "Owner" },
      ],
    },
  },
  partners: {
    partner_list: {
      label: "Partner List",
      columns: [
        { id: "name", label: "Name" },
        { id: "investment", label: "Investment" },
        { id: "balance", label: "Balance" },
      ],
    },
  },
};
