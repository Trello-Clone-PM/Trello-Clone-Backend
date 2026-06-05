import { prisma } from "../../config/db.js";
import { NotFound } from "../../lib/errors.js";
import { assertBoardAccess } from "../boards/boards.service.js";
import { endPosition, POSITION_STEP } from "../../lib/position.js";
import { emitToBoard } from "../../realtime/index.js";

const LIST_SELECT = { id: true, boardId: true, name: true, position: true, archived: true };

async function loadList(listId) {
  const list = await prisma.list.findUnique({ where: { id: listId }, select: LIST_SELECT });
  if (!list) throw NotFound("List not found");
  return list;
}

export async function listLists(userId, boardId) {
  await assertBoardAccess(userId, boardId);
  return prisma.list.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: LIST_SELECT,
  });
}

export async function getList(userId, listId) {
  const list = await loadList(listId);
  await assertBoardAccess(userId, list.boardId);
  return list;
}

export async function createList(userId, input) {
  await assertBoardAccess(userId, input.boardId, "ws_member");
  let position = input.position;
  if (position == null) {
    const max = await prisma.list.aggregate({
      where: { boardId: input.boardId },
      _max: { position: true },
    });
    position = endPosition(max._max.position);
  }
  const list = await prisma.list.create({
    data: { boardId: input.boardId, name: input.name, position },
    select: LIST_SELECT,
  });
  emitToBoard(list.boardId, "list:created", list);
  return list;
}

export async function updateList(userId, listId, input) {
  const existing = await loadList(listId);
  await assertBoardAccess(userId, existing.boardId, "ws_member");
  const list = await prisma.list.update({ where: { id: listId }, data: input, select: LIST_SELECT });
  emitToBoard(list.boardId, "list:updated", list);
  return list;
}

export async function deleteList(userId, listId) {
  const existing = await loadList(listId);
  await assertBoardAccess(userId, existing.boardId, "ws_member");
  await prisma.list.delete({ where: { id: listId } });
  emitToBoard(existing.boardId, "list:deleted", { id: listId });
}

const SORT_CMP = {
  name: (a, b) => a.title.localeCompare(b.title),
  due: (a, b) =>
    (a.dueDate ? +new Date(a.dueDate) : Infinity) - (b.dueDate ? +new Date(b.dueDate) : Infinity),
  created: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
};

export async function sortListCards(userId, listId, by) {
  const list = await loadList(listId);
  await assertBoardAccess(userId, list.boardId, "ws_member");
  const cards = await prisma.card.findMany({
    where: { listId, archived: false },
    select: { id: true, title: true, dueDate: true, createdAt: true },
  });
  const sorted = [...cards].sort(SORT_CMP[by]);
  await prisma.$transaction(
    sorted.map((c, i) => prisma.card.update({ where: { id: c.id }, data: { position: (i + 1) * POSITION_STEP } })),
  );
  emitToBoard(list.boardId, "list:sorted", { listId, by });
  return { listId, by, count: sorted.length };
}
