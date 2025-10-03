// middlewares/validation/updateInitialPayment.js
import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";

const schema = yup.object().shape({
  orderId: yup.string().required("orderId is required"),
  initialPayment: yup.number().required("initialPayment is required").min(0, "initialPayment must be >= 0"),
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
