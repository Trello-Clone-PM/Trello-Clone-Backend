import * as cards from "./cards.service.js";
import * as comments from "../comments/comments.service.js";
import * as labels from "../labels/labels.service.js";
import * as checklists from "../checklists/checklists.service.js";
import { createCardSchema, updateCardSchema, moveCardSchema } from "./cards.schema.js";
import { createCommentSchema } from "../comments/comments.schema.js";
import { createChecklistSchema } from "../checklists/checklists.schema.js";
import { z } from "zod";

export const list = async (req, res) => {
  res.json(await cards.listCards(req.user.id, { boardId: req.query.boardId, listId: req.query.listId }));
};

export const create = async (req, res) => {
  const input = createCardSchema.parse(req.body);
  res.status(201).json(await cards.createCard(req.user.id, input));
};

export const get = async (req, res) => {
  res.json(await cards.getCardDetail(req.user.id, req.params.id));
};

export const update = async (req, res) => {
  const input = updateCardSchema.parse(req.body);
  res.json(await cards.updateCard(req.user.id, req.params.id, input));
};

export const move = async (req, res) => {
  const input = moveCardSchema.parse(req.body);
  res.json(await cards.moveCard(req.user.id, req.params.id, input));
};

export const remove = async (req, res) => {
  await cards.deleteCard(req.user.id, req.params.id);
  res.status(204).end();
};

// --- nested: comments ---
export const listComments = async (req, res) => {
  res.json(await comments.listComments(req.user.id, req.params.id));
};

export const createComment = async (req, res) => {
  const input = createCommentSchema.parse(req.body);
  res.status(201).json(await comments.createComment(req.user.id, req.params.id, input));
};

// --- nested: labels ---
const attachLabelSchema = z.object({ labelId: z.string().uuid() });

export const attachLabel = async (req, res) => {
  const input = attachLabelSchema.parse(req.body);
  res.status(201).json(await labels.attachLabel(req.user.id, req.params.id, input.labelId));
};

export const detachLabel = async (req, res) => {
  await labels.detachLabel(req.user.id, req.params.id, req.params.labelId);
  res.status(204).end();
};

// --- nested: members ---
const addMemberSchema = z.object({ userId: z.string().uuid() });

export const addMember = async (req, res) => {
  const input = addMemberSchema.parse(req.body);
  res.status(201).json(await cards.addCardMember(req.user.id, req.params.id, input));
};

export const removeMember = async (req, res) => {
  await cards.removeCardMember(req.user.id, req.params.id, req.params.userId);
  res.status(204).end();
};

// --- nested: checklists ---
export const createChecklist = async (req, res) => {
  const input = createChecklistSchema.parse(req.body);
  res.status(201).json(await checklists.createChecklist(req.user.id, req.params.id, input));
};
