import { Router, type IRouter } from "express";
import healthRouter from "./health";
import transcribeRouter from "./transcribe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(transcribeRouter);

export default router;
