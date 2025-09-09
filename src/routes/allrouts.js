import healthRouter from "./Health/healthRoutes.js";
import userRouter from "./userRoute.js";
import supplierRouter from "./supplierRoute.js";
import orderRouter from "./orderRouter.js";
import productRouter from "./productRoute.js";

const routes = (app) => {
  app.use("/health", healthRouter);
  app.use("/user", userRouter);
  app.use("/supplier", supplierRouter);
  app.use("/order", orderRouter);
  app.use("/product", productRouter);
};

export default routes;
