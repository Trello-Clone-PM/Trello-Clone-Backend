import * as service from "./admin.service.js";
import {
  paginationSchema,
  suspendSchema,
  assignRoleSchema,
  auditQuerySchema,
} from "./admin.schema.js";

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.headers["user-agent"] });

export const stats = async (_req, res) => {
  res.json(await service.getStats());
};

export const listUsers = async (req, res) => {
  const q = paginationSchema.parse(req.query);
  res.json(await service.listUsers(q));
};

export const suspendUser = async (req, res) => {
  const input = suspendSchema.parse(req.body);
  res.json(await service.suspendUser(req.user.id, req.params.id, input.suspend, ctxOf(req)));
};

export const assignRole = async (req, res) => {
  const input = assignRoleSchema.parse(req.body);
  res.json(await service.assignRole(req.user.id, input, ctxOf(req)));
};

export const listWorkspaces = async (req, res) => {
  const q = paginationSchema.parse(req.query);
  res.json(await service.listWorkspaces(q));
};

export const deleteWorkspace = async (req, res) => {
  await service.deleteWorkspace(req.user.id, req.params.id, ctxOf(req));
  res.status(204).end();
};

export const listAudit = async (req, res) => {
  const q = auditQuerySchema.parse(req.query);
  res.json(await service.listAudit(q));
};
