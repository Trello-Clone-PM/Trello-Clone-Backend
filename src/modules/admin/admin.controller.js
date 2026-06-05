import * as service from "./admin.service.js";
import {
  paginationSchema,
  suspendSchema,
  assignRoleSchema,
  auditQuerySchema,
  resetPasswordSchema,
  updateWorkspaceSchema,
  transferOwnerSchema,
  lockSchema,
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

export const getUser = async (req, res) => {
  res.json(await service.getUserDetail(req.params.id));
};

export const resetPassword = async (req, res) => {
  const input = resetPasswordSchema.parse(req.body ?? {});
  res.json(await service.resetPassword(req.user.id, req.params.id, input.newPassword, ctxOf(req)));
};

export const deleteUser = async (req, res) => {
  await service.deleteUser(req.user.id, req.params.id, ctxOf(req));
  res.status(204).end();
};

export const impersonate = async (req, res) => {
  res.json(await service.impersonate(req.user.id, req.params.id, ctxOf(req)));
};

export const updateWorkspace = async (req, res) => {
  const input = updateWorkspaceSchema.parse(req.body);
  res.json(await service.updateWorkspace(req.user.id, req.params.id, input, ctxOf(req)));
};

export const transferOwner = async (req, res) => {
  const input = transferOwnerSchema.parse(req.body);
  res.json(await service.transferOwner(req.user.id, req.params.id, input.newOwnerId, ctxOf(req)));
};

export const lockWorkspace = async (req, res) => {
  const input = lockSchema.parse(req.body);
  res.json(await service.lockWorkspace(req.user.id, req.params.id, input.locked, ctxOf(req)));
};

export const storage = async (_req, res) => {
  res.json(await service.getStorage());
};
