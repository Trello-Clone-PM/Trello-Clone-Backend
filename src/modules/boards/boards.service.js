import { prisma } from "../../config/db.js";
import { NotFound } from "../../lib/errors.js";
import { assertWorkspaceAccess } from "../workspaces/workspaces.service.js";

// Board access derives from its workspace membership (MVP rule).
// Returns { board, role } or throws 404/403.
export async function assertBoardAccess(userId, boardId, minRole) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, workspaceId: true },
  });
  if (!board) throw NotFound("Board not found");
  const role = await assertWorkspaceAccess(userId, board.workspaceId, minRole);
  return { board, role };
}

export async function listBoards(userId, workspaceId) {
  await assertWorkspaceAccess(userId, workspaceId);
  const boards = await prisma.board.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      description: true,
      background: true,
      visibility: true,
      archived: true,
      createdAt: true,
      stars: { where: { userId }, select: { userId: true } },
    },
  });
  return boards.map(({ stars, ...b }) => ({ ...b, starred: stars.length > 0 }));
}

export async function setBoardStar(userId, boardId, starred) {
  await assertBoardAccess(userId, boardId);
  if (starred) {
    await prisma.boardStar.upsert({
      where: { boardId_userId: { boardId, userId } },
      create: { boardId, userId },
      update: {},
    });
  } else {
    await prisma.boardStar.deleteMany({ where: { boardId, userId } });
  }
  return { boardId, starred };
}

export async function createBoard(userId, input) {
  await assertWorkspaceAccess(userId, input.workspaceId, "ws_member");
  return prisma.board.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.description,
      background: input.background,
      visibility: input.visibility ?? "workspace",
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      description: true,
      background: true,
      visibility: true,
      archived: true,
      createdAt: true,
    },
  });
}

export async function updateBoard(userId, boardId, input) {
  await assertBoardAccess(userId, boardId, "ws_member");
  return prisma.board.update({
    where: { id: boardId },
    data: input,
    select: {
      id: true,
      workspaceId: true,
      name: true,
      description: true,
      background: true,
      visibility: true,
      archived: true,
      createdAt: true,
    },
  });
}

export async function deleteBoard(userId, boardId) {
  await assertBoardAccess(userId, boardId, "ws_admin");
  await prisma.board.delete({ where: { id: boardId } });
}

// Full nested board payload for the board view.
export async function getBoardDetail(userId, boardId) {
  await assertBoardAccess(userId, boardId);

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      description: true,
      background: true,
      visibility: true,
      archived: true,
      createdAt: true,
      stars: { where: { userId }, select: { userId: true } },
      labels: { select: { id: true, name: true, color: true, boardId: true } },
      lists: {
        where: { archived: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          boardId: true,
          name: true,
          position: true,
          archived: true,
          cards: {
            where: { archived: false },
            orderBy: { position: "asc" },
            select: {
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
              cardLabels: { select: { label: { select: { id: true, name: true, color: true } } } },
              members: {
                select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
              },
              _count: { select: { comments: true } },
              checklists: { select: { items: { select: { done: true } } } },
            },
          },
        },
      },
    },
  });
  if (!board) throw NotFound("Board not found");

  const lists = board.lists.map((l) => ({
    id: l.id,
    boardId: l.boardId,
    name: l.name,
    position: l.position,
    archived: l.archived,
    cards: l.cards.map((card) => {
      let done = 0;
      let total = 0;
      for (const cl of card.checklists) {
        for (const it of cl.items) {
          total += 1;
          if (it.done) done += 1;
        }
      }
      return {
        id: card.id,
        listId: card.listId,
        title: card.title,
        description: card.description,
        position: card.position,
        dueDate: card.dueDate,
        startDate: card.startDate,
        coverUrl: card.coverUrl,
        archived: card.archived,
        createdAt: card.createdAt,
        labels: card.cardLabels.map((cl) => cl.label),
        members: card.members.map((m) => m.user),
        commentCount: card._count.comments,
        checklistSummary: { done, total },
      };
    }),
  }));

  return {
    id: board.id,
    workspaceId: board.workspaceId,
    name: board.name,
    description: board.description,
    background: board.background,
    visibility: board.visibility,
    archived: board.archived,
    createdAt: board.createdAt,
    starred: board.stars.length > 0,
    labels: board.labels,
    lists,
  };
}
