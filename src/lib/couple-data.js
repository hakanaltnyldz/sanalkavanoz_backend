import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function mergeJson(baseValue, patchValue) {
  const base = baseValue && typeof baseValue === "object" ? cloneJson(baseValue) : {};
  const patch = patchValue && typeof patchValue === "object" ? cloneJson(patchValue) : {};
  return {
    ...base,
    ...patch,
  };
}

function sanitizeRecord(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  return cloneJson(data);
}

export function serializeCollectionItem(item) {
  return {
    id: item.itemKey,
    data: sanitizeRecord(item.data),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function serializeSharedDocument(document) {
  return {
    key: document.documentKey,
    data: sanitizeRecord(document.data),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export async function listCollectionItems({ coupleId, collectionName }) {
  const items = await prisma.coupleCollectionItem.findMany({
    where: {
      coupleId,
      collectionName,
    },
    orderBy: [
      {
        updatedAt: "asc",
      },
      {
        createdAt: "asc",
      },
      {
        itemKey: "asc",
      },
    ],
  });

  return items.map(serializeCollectionItem);
}

export async function upsertCollectionItem({
  coupleId,
  collectionName,
  itemKey,
  data,
  replace = false,
}) {
  const resolvedItemKey = itemKey?.trim() || randomUUID();
  // Tam yazmada (replace) mevcut kaydi okumaya gerek yok; bir sorgu tasarrufu.
  const existing =
    replace || !itemKey
      ? null
      : await prisma.coupleCollectionItem.findUnique({
          where: {
            coupleId_collectionName_itemKey: {
              coupleId,
              collectionName,
              itemKey: resolvedItemKey,
            },
          },
        });

  const nextData = replace
    ? sanitizeRecord(data)
    : mergeJson(existing?.data, data);

  const item = await prisma.coupleCollectionItem.upsert({
    where: {
      coupleId_collectionName_itemKey: {
        coupleId,
        collectionName,
        itemKey: resolvedItemKey,
      },
    },
    create: {
      coupleId,
      collectionName,
      itemKey: resolvedItemKey,
      data: nextData,
    },
    update: {
      data: nextData,
    },
  });

  return serializeCollectionItem(item);
}

export async function deleteCollectionItem({ coupleId, collectionName, itemKey }) {
  // Zaten silinmis bir kayit icin hata atma; iki cihaz ayni anda silebilir.
  await prisma.coupleCollectionItem.deleteMany({
    where: {
      coupleId,
      collectionName,
      itemKey,
    },
  });
}

export async function getSharedDocument({ coupleId, documentKey }) {
  const document = await prisma.coupleSharedDocument.findUnique({
    where: {
      coupleId_documentKey: {
        coupleId,
        documentKey,
      },
    },
  });

  return document ? serializeSharedDocument(document) : null;
}

export async function upsertSharedDocument({
  coupleId,
  documentKey,
  data,
  replace = false,
}) {
  const existing = replace
    ? null
    : await prisma.coupleSharedDocument.findUnique({
        where: {
          coupleId_documentKey: {
            coupleId,
            documentKey,
          },
        },
      });

  const nextData = replace
    ? sanitizeRecord(data)
    : mergeJson(existing?.data, data);

  const document = await prisma.coupleSharedDocument.upsert({
    where: {
      coupleId_documentKey: {
        coupleId,
        documentKey,
      },
    },
    create: {
      coupleId,
      documentKey,
      data: nextData,
    },
    update: {
      data: nextData,
    },
  });

  return serializeSharedDocument(document);
}

export async function deleteSharedDocument({ coupleId, documentKey }) {
  await prisma.coupleSharedDocument.deleteMany({
    where: {
      coupleId,
      documentKey,
    },
  });
}
