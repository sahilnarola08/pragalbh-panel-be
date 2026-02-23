import * as yup from "yup";
import { sendErrorResponse } from '../../util/commonResponses.js';

const imageObjectSchema = yup.object().shape({
    img: yup
        .string()
        .nullable()
        .notRequired()
        .transform((value, originalValue) => {
            // Convert empty strings, null, undefined to empty string for filtering
            const val = originalValue === null || originalValue === undefined ? '' : String(originalValue);
            return val.trim();
        })
        .test('is-url-or-empty', 'Product image URL must be a valid URL', function(value) {
            // Allow empty/null/undefined values - these will be filtered out by middleware
            const trimmedValue = value ? String(value).trim() : '';
            if (!trimmedValue || trimmedValue === '') {
                return true;
            }
            // If value exists, validate it's a URL using a simple URL regex check
            try {
                const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
                return urlRegex.test(trimmedValue);
            } catch {
                return false;
            }
        }),
});

// Product schema for products array
const productSchema = yup.object().shape({
    productName: yup.string().required("Product name is required").min(2, "Product name must be at least 2 characters").max(100, "Product name must not exceed 100 characters"),
    orderDate: yup.date().required("Order date is required"),
    dispatchDate: yup.date().required("Dispatch date is required"),
    purchasePrice: yup.number().required("Purchase price is required").min(0, "Purchase price must be greater than 0"),
    sellingPrice: yup.number().required("Selling price is required").min(0, "Selling price must be greater than 0"),
    initialPayment: yup.number().min(0, "Initial payment must be greater than or equal to 0").optional(),
    orderPlatform: yup.string().required("Order platform is required").matches(/^[0-9a-fA-F]{24}$/, 'Order platform must be a valid ObjectId'),
    mediator: yup.string().matches(/^[0-9a-fA-F]{24}$/, 'Mediator must be a valid ObjectId').optional(),
    mediators: yup.array().of(yup.string().matches(/^[0-9a-fA-F]{24}$/, 'Invalid mediator ObjectId')).optional(),
    paymentCurrency: yup.string().oneOf(['USD', 'INR']).optional(),
    productImages: yup
        .array()
        .of(imageObjectSchema)
        .max(5, "Maximum 5 product image URLs are allowed")
        .optional(),
});

// Order creation validation schema
const orderSchema = yup.object().shape({
    clientName: yup.string().required("Client name is required").min(2, "Client name must be at least 2 characters").max(100, "Client name must not exceed 100 characters"),
    address: yup.string().required("Address is required").min(2, "Address must be at least 2 characters").max(200, "Address must not exceed 200 characters"),
    products: yup
        .array()
        .of(productSchema)
        .required("Products array is required")
        .min(1, "At least one product is required"),
    supplier: yup.string().optional(),
    otherDetails: yup.string().optional(),
    shippingCost: yup.number().min(0, "Shipping cost must be greater than or equal to 0").optional(),
    supplierCost: yup.number().min(0, "Supplier cost must be greater than or equal to 0").optional(),
    packagingCost: yup.number().min(0, "Packaging cost must be greater than or equal to 0").optional(),
    otherExpenses: yup.number().min(0, "Other expenses must be greater than or equal to 0").optional(),
    bankName: yup.string().optional(),
    paymentAmount: yup.number().min(0, "Payment amount must be greater than or equal to 0").optional(),
});

// Order update validation schema (all fields optional)
const orderUpdateSchema = yup.object().shape({
    clientName: yup.string().min(2, "Client name must be at least 2 characters").max(100, "Client name must not exceed 100 characters").optional(),
    address: yup.string().min(2, "Address must be at least 2 characters").max(200, "Address must not exceed 200 characters").optional(),
    products: yup
        .array()
        .of(productSchema)
        .min(1, "At least one product is required")
        .optional(),
    supplier: yup.string().optional(),
    otherDetails: yup.string().optional(),
    shippingCost: yup.number().min(0, "Shipping cost must be greater than or equal to 0").optional(),
    supplierCost: yup.number().min(0, "Supplier cost must be greater than or equal to 0").optional(),
    packagingCost: yup.number().min(0, "Packaging cost must be greater than or equal to 0").optional(),
    otherExpenses: yup.number().min(0, "Other expenses must be greater than or equal to 0").optional(),
    bankName: yup.string().optional(),
    paymentAmount: yup.number().min(0, "Payment amount must be greater than or equal to 0").optional(),
});

// Order ID validation schema (accept MongoDB ObjectId or orderId string e.g. PJ022615)
const orderIdSchema = yup.object().shape({
    id: yup
        .string()
        .required('Order ID is required')
        .trim()
        .min(1, 'Order ID is required')
        .test('valid-order-id', 'Invalid order ID format', function(value) {
            if (!value) return false;
            // MongoDB ObjectId (24 hex chars)
            if (/^[0-9a-fA-F]{24}$/.test(value)) return true;
            // orderId string (e.g. PJ022615)
            if (value.length >= 2 && value.length <= 50) return true;
            return false;
        })
});

// Update order status validation schema
const updateOrderStatusSchema = yup.object().shape({
    orderId: yup.string().required("Order ID is required"),
    status: yup.string().required("Status is required"),
});

// Update tracking info validation schema
const updateTrackingInfoSchema = yup.object().shape({
    orderId: yup.string().required("Order ID is required"),
    trackingId: yup.string().required("Tracking ID is required"),
    courierCompany: yup.string().required("Courier company is required"),
    shippingCost: yup.number().min(0, "Shipping cost must be greater than or equal to 0").optional(),
});

// Update order checklist validation schema
const updateOrderChecklistSchema = yup.object().shape({
    orderId: yup.string().required("Order ID is required"),
    checklist: yup.array().of(yup.object().shape({
        id: yup.string().required("ID is required"),
        label: yup.string().required("Label is required"),
        checked: yup.boolean().required("Checked is required"),
    })).required("Checklist is required"),
});

// Validation middleware for order creation
const orderValidationSchema = async (req, res, next) => {
    try {
        // Clean up productImages in each product - filter out empty image objects before validation
        if (req.body.products && Array.isArray(req.body.products)) {
            req.body.products = req.body.products.map(product => {
                if (product.productImages && Array.isArray(product.productImages)) {
                    const filtered = product.productImages
                        .filter(item => {
                            // Filter out null, undefined, or empty img values
                            if (!item) return false;
                            if (item.img === null || item.img === undefined) return false;
                            if (typeof item.img === 'string' && item.img.trim() === '') return false;
                            return true;
                        })
                        .map(item => ({ img: String(item.img).trim() }));
                    
                    product.productImages = filtered.length > 0 ? filtered : undefined;
                }
                return product;
            });
        }
        
        await orderSchema.validate(req.body, { abortEarly: false });
        next();
    } catch (error) {
        const errors = error.inner.map(err => ({
            field: err.path,
            message: err.message
        }));

        return sendErrorResponse({
            status: 400,
            res,
            message: 'Validation failed',
            error: { errors }
        });
    }
};

// Validation middleware for order update
const validateOrderUpdate = async (req, res, next) => {
    try {
        // Validate order ID in params
        await orderIdSchema.validate({ id: req.params.id }, { abortEarly: false });
        
        // Clean up productImages in each product - filter out empty image objects before validation
        if (req.body.products && Array.isArray(req.body.products)) {
            req.body.products = req.body.products.map(product => {
                if (product.productImages && Array.isArray(product.productImages)) {
                    const filtered = product.productImages
                        .filter(item => {
                            // Filter out null, undefined, or empty img values
                            if (!item) return false;
                            if (item.img === null || item.img === undefined) return false;
                            if (typeof item.img === 'string' && item.img.trim() === '') return false;
                            return true;
                        })
                        .map(item => ({ img: String(item.img).trim() }));
                    
                    product.productImages = filtered.length > 0 ? filtered : undefined;
                }
                return product;
            });
        }
        
        // Validate body if provided
        if (Object.keys(req.body).length > 0) {
            await orderUpdateSchema.validate(req.body, { abortEarly: false });
        }
        
        next();
    } catch (error) {
        const errors = error.inner.map(err => ({
            field: err.path,
            message: err.message
        }));

        return sendErrorResponse({
            status: 400,
            res,
            message: 'Validation failed',
            error: { errors }
        });
    }
};

// Validation middleware for order delete
const validateOrderDelete = async (req, res, next) => {
    try {
        await orderIdSchema.validate({ id: req.params.id }, { abortEarly: false });
        next();
    } catch (error) {
        const errors = error.inner.map(err => ({
            field: err.path,
            message: err.message
        }));

        return sendErrorResponse({
            status: 400,
            res,
            message: 'Validation failed',
            error: { errors }
        });
    }
};

export { 
    orderValidationSchema, 
    updateOrderStatusSchema, 
    updateOrderChecklistSchema, 
    updateTrackingInfoSchema,
    validateOrderUpdate,
    validateOrderDelete
};