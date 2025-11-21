// middlewares/validation/updateInitialPayment.js
import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";

const schema = yup.object().shape({
  orderId: yup.string().required("orderId is required"),
  productIndex: yup.number().required("productIndex is required").integer("productIndex must be an integer").min(0, "productIndex must be >= 0"),
  initialPayment: yup.number().required("initialPayment is required").min(0, "initialPayment must be >= 0"),
  bankName: yup.string().optional(),
  paymentAmount: yup.number().min(0, "paymentAmount must be >= 0").optional(),
});

export const validateUpdateInitialPayment = async (req, res, next) => {
  try {
    await schema.validate(req.body, { abortEarly: false });
    next();
  } catch (err) {
    const errors = err.inner?.map(e => ({ field: e.path, message: e.message })) || [{ message: err.message }];
    return sendErrorResponse({
      res,
      status: 400,
      message: "Validation failed",
      error: { errors },
    });
  }
};
