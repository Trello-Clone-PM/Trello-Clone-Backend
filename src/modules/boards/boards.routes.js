import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ah } from "../../middleware/errorHandler.js";
import * as c from "./boards.controller.js";
import * as labels from "../labels/labels.controller.js";

export const boardsRouter = Router();

boardsRouter.use(authenticate);

boardsRouter.get("/", ah(c.list));
boardsRouter.post("/", ah(c.create));
boardsRouter.get("/:id", ah(c.get));
boardsRouter.patch("/:id", ah(c.update));
boardsRouter.delete("/:id", ah(c.remove));
boardsRouter.put("/:id/star", ah(c.star));

boardsRouter.get("/:id/labels", ah(labels.listForBoard));
boardsRouter.post("/:id/labels", ah(labels.createForBoard));
