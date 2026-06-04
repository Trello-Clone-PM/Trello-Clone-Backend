import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ah } from "../../middleware/errorHandler.js";
import * as c from "./lists.controller.js";

export const listsRouter = Router();

listsRouter.use(authenticate);

listsRouter.get("/", ah(c.list));
listsRouter.post("/", ah(c.create));
listsRouter.get("/:id", ah(c.get));
listsRouter.patch("/:id", ah(c.update));
listsRouter.delete("/:id", ah(c.remove));
