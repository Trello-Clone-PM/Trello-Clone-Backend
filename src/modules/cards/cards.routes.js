import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ah } from "../../middleware/errorHandler.js";
import * as c from "./cards.controller.js";

export const cardsRouter = Router();

cardsRouter.use(authenticate);

cardsRouter.get("/", ah(c.list));
cardsRouter.post("/", ah(c.create));
cardsRouter.get("/:id", ah(c.get));
cardsRouter.patch("/:id", ah(c.update));
cardsRouter.patch("/:id/move", ah(c.move));
cardsRouter.delete("/:id", ah(c.remove));

cardsRouter.get("/:id/comments", ah(c.listComments));
cardsRouter.post("/:id/comments", ah(c.createComment));

cardsRouter.post("/:id/labels", ah(c.attachLabel));
cardsRouter.delete("/:id/labels/:labelId", ah(c.detachLabel));

cardsRouter.post("/:id/checklists", ah(c.createChecklist));
