import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import publicRouter from "./public-routes.js";
import adminRouter from "./admin-routes.js";
import apiRouter from "./api-routes.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/api", apiRouter);
router.use("/admin", adminRouter);
router.use("/", publicRouter);

export default router;
