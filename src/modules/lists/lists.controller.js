import * as service from "./lists.service.js";
import { createListSchema, updateListSchema } from "./lists.schema.js";
import { BadRequest } from "../../lib/errors.js";

export const list = async (req, res) => {
  const boardId = req.query.boardId;
  if (!boardId) throw BadRequest("boardId query param required");
  res.json(await service.listLists(req.user.id, boardId));
};

export const create = async (req, res) => {
  const input = createListSchema.parse(req.body);
  res.status(201).json(await service.createList(req.user.id, input));
};

export const update = async (req, res) => {
  const input = updateListSchema.parse(req.body);
  res.json(await service.updateList(req.user.id, req.params.id, input));
};

export const remove = async (req, res) => {
  await service.deleteList(req.user.id, req.params.id);
  res.status(204).end();
};
