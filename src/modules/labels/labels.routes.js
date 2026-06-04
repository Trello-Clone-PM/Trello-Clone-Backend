import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ah } from "../../middleware/errorHandler.js";
import * as c from "./labels.controller.js";

export const labelsRouter = Router();

labelsRouter.use(authenticate);

labelsRouter.delete("/:id", ah(c.remove));
