import * as yup from "yup";

const userRegistrationSchema = yup.object().shape({
    clientName:yup.string().required("Client name is required").min(2, "Client name must be at least 2 characters").max(100, "Client name must not exceed 100 characters"),
    address: yup.string().required("Address is required").min(2, "Address must be at least 2 characters").max(100, "Address must not exceed 100 characters"),
    product: yup.string().required("Product is required").min(2, "Product must be at least 2 characters").max(100, "Product must not exceed 100 characters"),
    orderDate: yup.date().required("Order date is required").min(new Date(), "Order date must be at least today"),
    dispatchDate: yup.date().required("Dispatch date is required").min(new Date(), "Dispatch date must be at least today"),
    purchasePrice: yup.number().required("Purchase price is required"),
    sellingPrice: yup.number().required("Selling price is required"),
    orderPlatform: yup.string().required("Order platform is required").min(2, "Order platform must be at least 2 characters").max(100, "Order platform must not exceed 100 characters"),
});

const updateOrderStatusSchema = yup.object().shape({
    orderId: yup.string().required("Order ID is required"),
    status: yup.string().required("Status is required"),
    trackingId: yup.string().required("Tracking ID is required"),
    courierCompany: yup.string().required("Courier company is required"),
});


const updateOrderChecklistSchema = yup.object().shape({
    orderId: yup.string().required("Order ID is required"),
    checklist: yup.array().of(yup.object().shape({
        id: yup.string().required("ID is required"),
        label: yup.string().required("Label is required"),
        checked: yup.boolean().required("Checked is required"),
    })).required("Checklist is required"),
});

const orderValidationSchema = async (req, res, next) => {
    try {
        await orderValidationSchema.validate(req.body, { abortEarly: false });
        next();
    } catch (error) {
        const errors = error.inner.map(err => ({
            field: err.path,
            message: err.message
        }));
        return res.status(400).json({
            success: false,
            status: 400,
            message: "Validation failed",
            errors: errors
        });
    }
};

export { orderValidationSchema, updateOrderStatusSchema, updateOrderChecklistSchema };