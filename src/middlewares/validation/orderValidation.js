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

// Order creation validation schema
const orderSchema = yup.object().shape({
    clientName: yup.string().required("Client name is required").min(2, "Client name must be at least 2 characters").max(100, "Client name must not exceed 100 characters"),
    address: yup.string().required("Address is required").min(2, "Address must be at least 2 characters").max(200, "Address must not exceed 200 characters"),
    product: yup.string().required("Product is required").min(2, "Product must be at least 2 characters").max(100, "Product must not exceed 100 characters"),
    productImages: yup
        .array()
        .of(imageObjectSchema)
        .max(5, "Maximum 5 product image URLs are allowed")
        .optional(),
    productImage: yup.string().url("Product image must be a valid URL").optional(),
    orderDate: yup.date().required("Order date is required"),
    dispatchDate: yup.date().required("Dispatch date is required"),
    purchasePrice: yup.number().required("Purchase price is required").min(0, "Purchase price must be greater than 0"),
    sellingPrice: yup.number().required("Selling price is required").min(0, "Selling price must be greater than 0"),
    supplier: yup.string().optional(),
    orderPlatform: yup.string().required("Order platform is required").matches(/^[0-9a-fA-F]{24}$/, 'Order platform must be a valid ObjectId'),
    otherDetails: yup.string().optional(),
    shippingCost: yup.number().min(0, "Shipping cost must be greater than or equal to 0").optional(),
    initialPayment: yup.number().min(0, "Initial payment must be greater than or equal to 0").optional(),
});

// Order update validation schema (all fields optional)
const orderUpdateSchema = yup.object().shape({
    clientName: yup.string().min(2, "Client name must be at least 2 characters").max(100, "Client name must not exceed 100 characters").optional(),
    address: yup.string().min(2, "Address must be at least 2 characters").max(200, "Address must not exceed 200 characters").optional(),
    product: yup.string().min(2, "Product must be at least 2 characters").max(100, "Product must not exceed 100 characters").optional(),
    productImages: yup
        .array()
        .of(imageObjectSchema)
        .max(5, "Maximum 5 product image URLs are allowed")
        .optional(),
    productImage: yup.string().url("Product image must be a valid URL").optional(),
    orderDate: yup.date().optional(),
    dispatchDate: yup.date().optional(),
    purchasePrice: yup.number().min(0, "Purchase price must be greater than 0").optional(),
    sellingPrice: yup.number().min(0, "Selling price must be greater than 0").optional(),
    supplier: yup.string().optional(),
    orderPlatform: yup.string().matches(/^[0-9a-fA-F]{24}$/, 'Order platform must be a valid ObjectId').optional(),
    otherDetails: yup.string().optional(),
    shippingCost: yup.number().min(0, "Shipping cost must be greater than or equal to 0").optional(),
    initialPayment: yup.number().min(0, "Initial payment must be greater than or equal to 0").optional(),
});

// Order ID validation schema
const orderIdSchema = yup.object().shape({
    id: yup
        .string()
        .required('Order ID is required')
        .matches(/^[0-9a-fA-F]{24}$/, 'Invalid order ID format')
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
        // Clean up productImages - filter out empty image objects before validation
        if (req.body.productImages && Array.isArray(req.body.productImages)) {
            const filtered = req.body.productImages
                .filter(item => {
                    // Filter out null, undefined, or empty img values
                    if (!item) return false;
                    if (item.img === null || item.img === undefined) return false;
                    if (typeof item.img === 'string' && item.img.trim() === '') return false;
                    return true;
                })
                .map(item => ({ img: String(item.img).trim() }));
            
            // If all items were empty, remove the productImages field or set to empty array
            if (filtered.length === 0) {
                delete req.body.productImages;
            } else {
                req.body.productImages = filtered;
            }
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
        
        // Clean up productImages - filter out empty image objects before validation
        if (req.body.productImages && Array.isArray(req.body.productImages)) {
            const filtered = req.body.productImages
                .filter(item => {
                    // Filter out null, undefined, or empty img values
                    if (!item) return false;
                    if (item.img === null || item.img === undefined) return false;
                    if (typeof item.img === 'string' && item.img.trim() === '') return false;
                    return true;
                })
                .map(item => ({ img: String(item.img).trim() }));
            
            // If all items were empty, remove the productImages field or set to empty array
            if (filtered.length === 0) {
                delete req.body.productImages;
            } else {
                req.body.productImages = filtered;
            }
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