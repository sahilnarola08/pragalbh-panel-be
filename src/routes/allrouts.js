import healthRouter from "./Health/healthRoutes.js";
import userRouter from "./userRoute.js";
import supplierRouter from "./supplierRoute.js";
import orderRouter from "./orderRouter.js";
import productRouter from "./productRoute.js";
import schedulerRouter from "./schedulerRouter.js";
import incomeExpRouter from "./incomeExpRouts.js";
import supOrdDetailsRouter from "./supOrdDetailsRouter.js";
import masterRouter from "./masterRoute.js";
import uploadRouter from "./uploadRoute.js";
import dashboardRouter from "./dashboardRoute.js";
import authRouter from "./authRoute.js";
import coastRouter from "./coastRoute.js";
import laborPriceRouter from "./laborPriceRoute.js";
import diamondMasterRouter from "./diamondMasterRoute.js";
import pricingProductRouter from "./pricingProductRoute.js";

const routes = (app) => {
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/user", userRouter);
  app.use("/supplier", supplierRouter);
  app.use("/order", orderRouter);
  app.use("/product", productRouter);
  app.use("/scheduler", schedulerRouter);
  app.use("/income-expance", incomeExpRouter);
  app.use("/supplier-orderdetails", supOrdDetailsRouter);
  app.use("/master", masterRouter);
  app.use("/upload", uploadRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/coast", coastRouter);
  app.use("/labor-pricing", laborPriceRouter);
  app.use("/diamond-master", diamondMasterRouter);
  app.use("/pricing-products", pricingProductRouter);
};

export default routes;
