import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/require-auth.js";
import { requireMembership } from "../lib/couple.js";
import {
  deleteCollectionItem,
  deleteSharedDocument,
  getSharedDocument,
  listCollectionItems,
  upsertCollectionItem,
  upsertSharedDocument,
} from "../lib/couple-data.js";
import {
  emitCollectionDelete,
  emitCollectionUpsert,
  emitDocumentDelete,
  emitDocumentUpdate,
} from "../socket/socket.js";

const router = Router();

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9:_-]+$/, "Anahtar formati gecersiz.");

const recordSchema = z.record(z.string(), z.any());

const collectionParamsSchema = z.object({
  collectionName: keySchema,
});

const collectionItemParamsSchema = z.object({
  collectionName: keySchema,
  itemId: keySchema,
});

const documentParamsSchema = z.object({
  documentKey: keySchema,
});

const collectionWriteSchema = z.object({
  itemId: keySchema.optional(),
  data: recordSchema.default({}),
  replace: z.boolean().optional(),
});

const documentWriteSchema = z.object({
  data: recordSchema.default({}),
  replace: z.boolean().optional(),
});

router.use(requireAuth);

router.get("/collections/:collectionName", async (req, res) => {
  const { collectionName } = collectionParamsSchema.parse(req.params);
  const membership = await requireMembership(req.user.id);
  const items = await listCollectionItems({
    coupleId: membership.coupleId,
    collectionName,
  });

  return res.json({
    items,
  });
});

router.post("/collections/:collectionName", async (req, res) => {
  const { collectionName } = collectionParamsSchema.parse(req.params);
  const input = collectionWriteSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const item = await upsertCollectionItem({
    coupleId: membership.coupleId,
    collectionName,
    itemKey: input.itemId,
    data: input.data,
    replace: input.replace === true,
  });

  emitCollectionUpsert(io, membership.coupleId, collectionName, item);

  return res.status(input.itemId ? 200 : 201).json({
    item,
  });
});

router.put("/collections/:collectionName/:itemId", async (req, res) => {
  const { collectionName, itemId } = collectionItemParamsSchema.parse(req.params);
  const input = collectionWriteSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const item = await upsertCollectionItem({
    coupleId: membership.coupleId,
    collectionName,
    itemKey: itemId,
    data: input.data,
    replace: input.replace !== false,
  });

  emitCollectionUpsert(io, membership.coupleId, collectionName, item);

  return res.json({
    item,
  });
});

router.patch("/collections/:collectionName/:itemId", async (req, res) => {
  const { collectionName, itemId } = collectionItemParamsSchema.parse(req.params);
  const input = collectionWriteSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const item = await upsertCollectionItem({
    coupleId: membership.coupleId,
    collectionName,
    itemKey: itemId,
    data: input.data,
    replace: false,
  });

  emitCollectionUpsert(io, membership.coupleId, collectionName, item);

  return res.json({
    item,
  });
});

router.delete("/collections/:collectionName/:itemId", async (req, res) => {
  const { collectionName, itemId } = collectionItemParamsSchema.parse(req.params);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  await deleteCollectionItem({
    coupleId: membership.coupleId,
    collectionName,
    itemKey: itemId,
  });

  emitCollectionDelete(io, membership.coupleId, collectionName, itemId);

  return res.status(204).send();
});

router.get("/documents/:documentKey", async (req, res) => {
  const { documentKey } = documentParamsSchema.parse(req.params);
  const membership = await requireMembership(req.user.id);
  const document = await getSharedDocument({
    coupleId: membership.coupleId,
    documentKey,
  });

  return res.json({
    document,
  });
});

router.put("/documents/:documentKey", async (req, res) => {
  const { documentKey } = documentParamsSchema.parse(req.params);
  const input = documentWriteSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const document = await upsertSharedDocument({
    coupleId: membership.coupleId,
    documentKey,
    data: input.data,
    replace: input.replace !== false,
  });

  emitDocumentUpdate(io, membership.coupleId, documentKey, document);

  return res.json({
    document,
  });
});

router.patch("/documents/:documentKey", async (req, res) => {
  const { documentKey } = documentParamsSchema.parse(req.params);
  const input = documentWriteSchema.parse(req.body);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  const document = await upsertSharedDocument({
    coupleId: membership.coupleId,
    documentKey,
    data: input.data,
    replace: false,
  });

  emitDocumentUpdate(io, membership.coupleId, documentKey, document);

  return res.json({
    document,
  });
});

router.delete("/documents/:documentKey", async (req, res) => {
  const { documentKey } = documentParamsSchema.parse(req.params);
  const membership = await requireMembership(req.user.id);
  const io = req.app.get("io");

  await deleteSharedDocument({
    coupleId: membership.coupleId,
    documentKey,
  });

  emitDocumentDelete(io, membership.coupleId, documentKey);

  return res.status(204).send();
});

export default router;
