import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { ah } from "../../middleware/errorHandler.js";
import * as c from "./admin.controller.js";

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get("/stats", authorize("users.list"), ah(c.stats));
adminRouter.get("/users", authorize("users.list"), ah(c.listUsers));
adminRouter.post("/users/:id/suspend", authorize("users.suspend"), ah(c.suspendUser));
adminRouter.post("/roles/assign", authorize("roles.assign"), ah(c.assignRole));
adminRouter.get("/workspaces", authorize("workspaces.list"), ah(c.listWorkspaces));
adminRouter.delete("/workspaces/:id", authorize("workspaces.delete"), ah(c.deleteWorkspace));
adminRouter.get("/audit", authorize("system.view_audit_log"), ah(c.listAudit));
