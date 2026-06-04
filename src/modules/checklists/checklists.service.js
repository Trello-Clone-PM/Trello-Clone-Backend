import { prisma } from "../../config/db.js";
import { NotFound } from "../../lib/errors.js";
import { assertCardAccess } from "../cards/cards.service.js";
import { assertWorkspaceAccess } from "../workspaces/workspaces.service.js";
import { endPosition } from "../../lib/position.js";

const CHECKLIST_SELECT = { id: true, cardId: true, title: true, position: true };
const ITEM_SELECT = { id: true, checklistId: true, text: true, done: true, position: true };

export async function createChecklist(userId, cardId, input) {
  await assertCardAccess(userId, cardId, "ws_member");
  const max = await prisma.checklist.aggregate({
    where: { cardId },
    _max: { position: true },
  });
  return prisma.checklist.create({
    data: { cardId, title: input.title, position: endPosition(max._max.position) },
    select: CHECKLIST_SELECT,
  });
}

async function loadChecklistScope(checklistId) {
  const cl = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: {
      id: true,
      cardId: true,
      card: { select: { list: { select: { board: { select: { workspaceId: true } } } } } },
    },
  });
  if (!cl) throw NotFound("Checklist not found");
  return cl;
}

export async function deleteChecklist(userId, checklistId) {
  const cl = await loadChecklistScope(checklistId);
  await assertWorkspaceAccess(userId, cl.card.list.board.workspaceId, "ws_member");
  await prisma.checklist.delete({ where: { id: checklistId } });
}

export async function createItem(userId, checklistId, input) {
  const cl = await loadChecklistScope(checklistId);
  await assertWorkspaceAccess(userId, cl.card.list.board.workspaceId, "ws_member");
  const max = await prisma.checklistItem.aggregate({
    where: { checklistId },
    _max: { position: true },
  });
  return prisma.checklistItem.create({
    data: { checklistId, text: input.text, position: endPosition(max._max.position) },
    select: ITEM_SELECT,
  });
}

async function loadItemScope(itemId) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      checklist: {
        select: { card: { select: { list: { select: { board: { select: { workspaceId: true } } } } } } },
      },
    },
  });
  if (!item) throw NotFound("Checklist item not found");
  return item;
}

export async function updateItem(userId, itemId, input) {
  const item = await loadItemScope(itemId);
  await assertWorkspaceAccess(userId, item.checklist.card.list.board.workspaceId, "ws_member");
  return prisma.checklistItem.update({ where: { id: itemId }, data: input, select: ITEM_SELECT });
}

export async function deleteItem(userId, itemId) {
  const item = await loadItemScope(itemId);
  await assertWorkspaceAccess(userId, item.checklist.card.list.board.workspaceId, "ws_member");
  await prisma.checklistItem.delete({ where: { id: itemId } });
}
