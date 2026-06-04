import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { ah } from "../../middleware/errorHandler.js";
import * as c from "./workspaces.controller.js";

export const workspacesRouter = Router();

workspacesRouter.use(authenticate);

workspacesRouter.get("/", ah(c.list));
workspacesRouter.post("/", ah(c.create));
workspacesRouter.get("/:id", ah(c.get));
workspacesRouter.patch("/:id", ah(c.update));
workspacesRouter.delete("/:id", ah(c.remove));
workspacesRouter.get("/:id/members", ah(c.listMembers));
workspacesRouter.post("/:id/members", ah(c.addMember));
