import { prisma } from "../../config/db.js";
import { NotFound, BadRequest } from "../../lib/errors.js";
import { assertWorkspaceAccess } from "../workspaces/workspaces.service.js";
import { endPosition } from "../../lib/position.js";
import { emitToBoard } from "../../realtime/index.js";

const CARD_SELECT = {
  id: true,
  listId: true,
  title: true,
  description: true,
  position: true,
  dueDate: true,
  startDate: true,
  coverUrl: true,
  archived: true,
  createdAt: true,
};

// Resolves a card to its board + workspace and asserts membership.
// Returns { card: {...CARD fields, boardId, workspaceId}, role }.
export async function assertCardAccess(userId, cardId, minRole) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { ...CARD_SELECT, list: { select: { boardId: true, board: { select: { workspaceId: true } } } } },
  });
  if (!card) throw NotFound("Card not found");
  const workspaceId = card.list.board.workspaceId;
  const role = await assertWorkspaceAccess(userId, workspaceId, minRole);
  const { list, ...rest } = card;
  return { card: { ...rest, boardId: list.boardId, workspaceId }, role };
}

async function listToBoard(listId) {
  const list = await prisma.list.findUnique({
    where: { id: listId },
    select: { id: true, boardId: true, board: { select: { workspaceId: true } } },
  });
  if (!list) throw NotFound("List not found");
  return { boardId: list.boardId, workspaceId: list.board.workspaceId };
}

function withLabelsMembers(card) {
  return {
    ...stripJoins(card),
    labels: card.cardLabels.map((cl) => cl.label),
    members: card.members.map((m) => m.user),
    commentCount: card._count.comments,
  };
}

function stripJoins(card) {
  const { cardLabels, members, _count, ...rest } = card;
  return rest;
}

export async function listCards(userId, { boardId, listId }) {
  let resolvedBoardId = boardId;
  if (listId && !boardId) resolvedBoardId = (await listToBoard(listId)).boardId;
  if (!resolvedBoardId) throw BadRequest("boardId or listId required");

  const board = await prisma.board.findUnique({
    where: { id: resolvedBoardId },
    select: { workspaceId: true },
  });
  if (!board) throw NotFound("Board not found");
  await assertWorkspaceAccess(userId, board.workspaceId);

  const cards = await prisma.card.findMany({
    where: {
      list: { boardId: resolvedBoardId },
      ...(listId ? { listId } : {}),
    },
    orderBy: { position: "asc" },
    select: {
      ...CARD_SELECT,
      cardLabels: { select: { label: { select: { id: true, name: true, color: true } } } },
      members: { select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
      _count: { select: { comments: true } },
    },
  });
  return cards.map(withLabelsMembers);
}

export async function createCard(userId, input) {
  const { boardId, workspaceId } = await listToBoard(input.listId);
  await assertWorkspaceAccess(userId, workspaceId, "ws_member");

  let position = input.position;
  if (position == null) {
    const max = await prisma.card.aggregate({
      where: { listId: input.listId },
      _max: { position: true },
    });
    position = endPosition(max._max.position);
  }

  const card = await prisma.card.create({
    data: { listId: input.listId, title: input.title, position },
    select: CARD_SELECT,
  });

  await prisma.activity.create({
    data: { boardId, cardId: card.id, actorId: userId, action: "card.created", metadata: { title: card.title } },
  });
  emitToBoard(boardId, "card:created", card);
  return card;
}

export async function getCardDetail(userId, cardId) {
  await assertCardAccess(userId, cardId);
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      ...CARD_SELECT,
      cardLabels: { select: { label: { select: { id: true, name: true, color: true } } } },
      members: { select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          cardId: true,
          body: true,
          editedAt: true,
          createdAt: true,
          author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      checklists: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          cardId: true,
          title: true,
          position: true,
          items: {
            orderBy: { position: "asc" },
            select: { id: true, checklistId: true, text: true, done: true, position: true },
          },
        },
      },
    },
  });

  const { cardLabels, members, ...rest } = card;
  return {
    ...rest,
    labels: cardLabels.map((cl) => cl.label),
    members: members.map((m) => m.user),
  };
}

export async function updateCard(userId, cardId, input) {
  const { card } = await assertCardAccess(userId, cardId, "ws_member");
  const data = { ...input };
  if (data.dueDate != null) data.dueDate = new Date(data.dueDate);
  if (data.startDate != null) data.startDate = new Date(data.startDate);

  const updated = await prisma.card.update({
    where: { id: cardId },
    data,
    select: CARD_SELECT,
  });
  emitToBoard(card.boardId, "card:updated", updated);
  return updated;
}

export async function moveCard(userId, cardId, input) {
  const { card } = await assertCardAccess(userId, cardId, "ws_member");
  const dest = await listToBoard(input.listId);
  if (dest.boardId !== card.boardId) {
    throw BadRequest("Cannot move card across boards", "CROSS_BOARD_MOVE");
  }

  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { listId: input.listId, position: input.position },
    select: CARD_SELECT,
  });

  await prisma.activity.create({
    data: {
      boardId: card.boardId,
      cardId,
      actorId: userId,
      action: "card.moved",
      metadata: { fromList: card.listId, toList: input.listId, position: input.position },
    },
  });
  emitToBoard(card.boardId, "card:moved", updated);
  return updated;
}

export async function deleteCard(userId, cardId) {
  const { card } = await assertCardAccess(userId, cardId, "ws_member");
  await prisma.card.delete({ where: { id: cardId } });
  emitToBoard(card.boardId, "card:deleted", { id: cardId, listId: card.listId });
}
