import * as service from "./workspaces.service.js";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  addMemberSchema,
} from "./workspaces.schema.js";

export const list = async (req, res) => {
  res.json(await service.listWorkspaces(req.user.id));
};

export const create = async (req, res) => {
  const input = createWorkspaceSchema.parse(req.body);
  res.status(201).json(await service.createWorkspace(req.user.id, input));
};

export const get = async (req, res) => {
  res.json(await service.getWorkspace(req.user.id, req.params.id));
};

export const update = async (req, res) => {
  const input = updateWorkspaceSchema.parse(req.body);
  res.json(await service.updateWorkspace(req.user.id, req.params.id, input));
};

export const remove = async (req, res) => {
  await service.deleteWorkspace(req.user.id, req.params.id);
  res.status(204).end();
};

export const listMembers = async (req, res) => {
  res.json(await service.listMembers(req.user.id, req.params.id));
};

export const addMember = async (req, res) => {
  const input = addMemberSchema.parse(req.body);
  res.status(201).json(await service.addMember(req.user.id, req.params.id, input));
};
