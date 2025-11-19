import express from "express";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const.js";
import * as db from "./db.js";
import { attachUser, requireAdmin } from "./middleware/session.js";
import {
  processPriceQuote,
  meetsTargetPrice,
  findLowestPriceSupplier,
} from "./pricing.js";
import { createSessionToken } from "./session.js";
import { ENV } from "./_core/env.js";
import { getSessionCookieOptions } from "./_core/cookies.js";

export function registerRoutes(app: express.Express) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/auth/login", attachUser, async (req, res) => {
    const { login, password } = req.body ?? {};
    if (login !== ENV.adminLogin || password !== ENV.adminPassword) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const adminOpenId = `admin:${ENV.adminLogin}`;
    const now = new Date();
    await db.upsertUser({
      openId: adminOpenId,
      name: "Administrador",
      loginMethod: "manual",
      role: "admin",
      lastSignedIn: now,
    });

    const sessionToken = await createSessionToken(adminOpenId, "Administrador");
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    const user = await db.getUserByOpenId(adminOpenId);
    return res.json({ success: true, user });
  });

  router.post("/auth/logout", attachUser, (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    req.user = null;
    res.json({ success: true });
  });

  router.get("/auth/me", attachUser, (req, res) => {
    if (!req.user) {
      return res.status(204).end();
    }
    return res.json(req.user);
  });

  // Supplier routes
  router.get("/supplier/preview", async (req, res) => {
    const quotationId = Number(req.query.quotationId);
    if (!quotationId) {
      return res.status(400).json({ error: "quotationId is required" });
    }
    const quotation = await db.getQuotationById(quotationId);
    if (!quotation) {
      return res.status(404).json({ error: "Cotacao nao encontrada" });
    }
    const items = await db.getQuotationItems(quotationId);
    res.json({ quotation, items });
  });

  router.post("/supplier/login", async (req, res) => {
    const { quotationId: rawQuotationId, cnpj, companyName, password } = req.body ?? {};
    if (!cnpj || !companyName || !password) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    let supplier = null;
    let quotationId: number | undefined =
      typeof rawQuotationId === "number"
        ? rawQuotationId
        : rawQuotationId
          ? Number(rawQuotationId)
          : undefined;

    if (quotationId) {
      supplier = await db.getSupplierByCnpjForQuotation(cnpj, quotationId);
    }

    if (!supplier) {
      supplier = await db.getSupplierByCnpjAndPassword(cnpj, password);
      quotationId = supplier?.quotationId ?? quotationId;
    }

    if (!supplier || !supplier.quotationId) {
      return res.status(404).json({ error: "Fornecedor nao encontrado" });
    }

    if (quotationId && supplier.quotationId !== quotationId) {
      return res.status(401).json({ error: "Fornecedor nao autorizado" });
    }

    if (
      supplier.companyName?.toLowerCase().trim() !==
      companyName.toLowerCase().trim()
    ) {
      return res.status(401).json({ error: "Nome fantasia nao confere" });
    }

    if (new Date() > supplier.passwordExpiresAt) {
      return res.status(401).json({ error: "Senha expirada" });
    }

    if (supplier.temporaryPassword !== password) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    res.json({
      success: true,
      supplierId: supplier.id,
      companyName: supplier.companyName,
      quotationId: supplier.quotationId,
    });
  });

  router.get("/supplier/quotation", async (req, res) => {
    const quotationId = Number(req.query.quotationId);
    const supplierId = Number(req.query.supplierId);
    if (!quotationId || !supplierId) {
      return res.status(400).json({ error: "quotationId e supplierId obrigatórios" });
    }
    const supplier = await db.getSupplierById(supplierId);
    if (!supplier || supplier.quotationId !== quotationId) {
      return res.status(403).json({ error: "Fornecedor nao autorizado" });
    }
    const quotation = await db.getQuotationById(quotationId);
    if (!quotation) {
      return res.status(404).json({ error: "Cotacao nao encontrada" });
    }
    if (quotation.status !== "active") {
      return res.status(400).json({ error: "Cotacao nao esta ativa" });
    }
    if (new Date() > quotation.expiresAt) {
      return res.status(400).json({ error: "Prazo expirado" });
    }
    const items = await db.getQuotationItems(quotationId);
    const existingQuotes = await db.getSupplierQuotes(quotationId, supplierId);
    const observations = await db.getSupplierObservationsForSupplier(
      quotationId,
      supplierId
    );
    res.json({
      quotation,
      items,
      existingQuotes,
      supplier: {
        id: supplier.id,
        companyName: supplier.companyName,
        submittedAt: supplier.submittedAt,
      },
      observations: observations.map(obs => ({
        quotationItemId: obs.quotationItemId,
        note: obs.note,
      })),
    });
  });

  router.post("/supplier/price", async (req, res) => {
    const {
      quotationId,
      supplierId,
      quotationItemId,
      priceInReal,
      priceInDollar,
      ipiPercentage,
      icmsPercentage,
    } = req.body ?? {};
    if (!quotationId || !supplierId || !quotationItemId) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    const supplier = await db.getSupplierById(supplierId);
    if (!supplier || supplier.quotationId !== quotationId) {
      return res.status(403).json({ error: "Fornecedor nao autorizado" });
    }
    if (supplier.submittedAt) {
      return res.status(400).json({ error: "Cotacao ja enviada" });
    }
    const priceData = await processPriceQuote(
      priceInReal,
      priceInDollar,
      ipiPercentage,
      icmsPercentage
    );
    const existingQuotes = await db.getSupplierQuotes(quotationId, supplierId);
    const existingQuote = existingQuotes.find(
      q => q.quotationItemId === quotationItemId
    );
    if (existingQuote) {
      await db.updateSupplierQuote(existingQuote.id, {
        priceInReal: priceInReal ? priceInReal.toString() : null,
        priceInDollar: priceInDollar ? priceInDollar.toString() : null,
        exchangeRate: priceData.exchangeRate.toString(),
        ipiPercentage: ipiPercentage ? ipiPercentage.toString() : null,
        icmsPercentage: icmsPercentage ? icmsPercentage.toString() : null,
        finalPrice: priceData.finalPrice.toString(),
      });
    } else {
      await db.createSupplierQuote({
        quotationId,
        supplierId,
        quotationItemId,
        priceInReal: priceInReal ? priceInReal.toString() : null,
        priceInDollar: priceInDollar ? priceInDollar.toString() : null,
        exchangeRate: priceData.exchangeRate.toString(),
        ipiPercentage: ipiPercentage ? ipiPercentage.toString() : null,
        icmsPercentage: icmsPercentage ? icmsPercentage.toString() : null,
        finalPrice: priceData.finalPrice.toString(),
      });
    }
    res.json({ success: true, finalPrice: priceData.finalPrice });
  });

  router.post("/supplier/observation", async (req, res) => {
    const { quotationId, supplierId, quotationItemId, observation } = req.body ?? {};
    if (!quotationId || !supplierId || !quotationItemId || !observation) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    const supplier = await db.getSupplierById(supplierId);
    if (!supplier || supplier.quotationId !== quotationId) {
      return res.status(403).json({ error: "Fornecedor nao autorizado" });
    }
    if (supplier.submittedAt) {
      return res.status(400).json({ error: "Cotacao ja enviada" });
    }
    await db.upsertSupplierObservation({
      quotationId,
      supplierId,
      quotationItemId,
      note: observation.trim(),
    });
    res.json({ success: true });
  });

  router.post("/supplier/submit", async (req, res) => {
    const { quotationId, supplierId } = req.body ?? {};
    if (!quotationId || !supplierId) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    const supplier = await db.getSupplierById(supplierId);
    if (!supplier || supplier.quotationId !== quotationId) {
      return res.status(403).json({ error: "Fornecedor nao autorizado" });
    }
    if (supplier.submittedAt) {
      return res.status(400).json({ error: "Cotacao ja enviada anteriormente" });
    }
    const quotes = await db.getSupplierQuotes(quotationId, supplierId);
    if (quotes.length === 0) {
      return res.status(400).json({ error: "Informe ao menos um preco" });
    }
    await db.markSupplierSubmission(supplier.id, true);
    res.json({ success: true, submittedAt: new Date().toISOString() });
  });

  // Admin routes (protected)
  router.use("/admin", attachUser, requireAdmin);

  router.get("/admin/quotations", async (_req, res) => {
    const quotations = await db.getAllQuotations();
    res.json(quotations);
  });

  router.post("/admin/quotations", async (req, res) => {
    const { title, description, daysUntilExpiry = 14, useTemplate = true } = req.body ?? {};
    if (!title) {
      return res.status(400).json({ error: "Título obrigatório" });
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(daysUntilExpiry || 0));
    const quotation = await db.createQuotation({
      title,
      description,
      status: "active",
      expiresAt,
    });
    if (useTemplate) {
      await db.seedDefaultQuotationItems(quotation.id);
    }
    res.json({ success: true, quotationId: quotation.id });
  });

  router.get("/admin/quotations/:id/summary", async (req, res) => {
    const quotationId = Number(req.params.id);
    const quotation = await db.getQuotationById(quotationId);
    if (!quotation) {
      return res.status(404).json({ error: "Cotacao nao encontrada" });
    }
    const suppliers = await db.getSuppliersByQuotation(quotationId);
    const supplierMap = new Map(suppliers.map(s => [s.id, s]));
    const submittedSupplierIds = new Set(
      suppliers.filter(s => s.submittedAt).map(s => s.id)
    );
    const items = await db.getQuotationItems(quotationId);
    const allQuotes = await db.getQuotationQuotes(quotationId);
    const quotes = allQuotes.filter(q => submittedSupplierIds.has(q.supplierId));
    const observations = await db.getSupplierObservationsByQuotation(quotationId);
    const observationMap = new Map<number, Array<{ supplierId: number; note: string }>>();
    observations.forEach(obs => {
      const list = observationMap.get(obs.quotationItemId) ?? [];
      list.push({ supplierId: obs.supplierId, note: obs.note });
      observationMap.set(obs.quotationItemId, list);
    });

    const summary = items.map(item => {
      const itemQuotes = quotes
        .filter(q => q.quotationItemId === item.id)
        .map(q => ({
          supplierId: q.supplierId,
          finalPrice: parseFloat(q.finalPrice.toString()),
          supplierName:
            supplierMap.get(q.supplierId)?.companyName ?? `Fornecedor #${q.supplierId}`,
        }))
        .sort((a, b) => a.finalPrice - b.finalPrice);
      const lowestQuote = itemQuotes[0] ?? null;
      const meetsTarget =
        item.targetPrice && lowestQuote
          ? meetsTargetPrice(lowestQuote.finalPrice, parseFloat(item.targetPrice))
          : false;
      return {
        itemId: item.id,
        itemName: item.itemName,
        targetPrice: item.targetPrice ? parseFloat(item.targetPrice) : null,
        lowestPrice: lowestQuote?.finalPrice || null,
        winningSupplierId: lowestQuote?.supplierId || null,
        meetsTarget,
        quoteCount: itemQuotes.length,
        quantity: item.quantity,
        quantityToBuy: item.quantityToBuy,
        candidates: itemQuotes,
        observations: (observationMap.get(item.id) ?? []).map(obs => ({
          supplierId: obs.supplierId,
          supplierName:
            supplierMap.get(obs.supplierId)?.companyName ?? `Fornecedor #${obs.supplierId}`,
          note: obs.note,
        })),
      };
    });

    res.json({ quotation, summary });
  });

  router.post("/admin/quotations/:id", async (req, res) => {
    const quotationId = Number(req.params.id);
    const { title, description, status, daysUntilExpiry } = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status) updates.status = status;
    if (typeof daysUntilExpiry === "number") {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + daysUntilExpiry);
      updates.expiresAt = expiresAt;
    }
    await db.updateQuotationDetails(quotationId, updates as any);
    res.json({ success: true });
  });

  router.delete("/admin/quotations/:id", async (req, res) => {
    const quotationId = Number(req.params.id);
    await db.deleteQuotation(quotationId);
    res.json({ success: true });
  });

  router.post("/admin/items/:id/target", async (req, res) => {
    const itemId = Number(req.params.id);
    const { targetPrice, itemName } = req.body ?? {};
    if (typeof targetPrice !== "number") {
      return res.status(400).json({ error: "targetPrice obrigatório" });
    }
    await db.updateQuotationItemTarget(itemId, targetPrice, itemName);
    res.json({ success: true });
  });

  router.post("/admin/items/:id/quantities", async (req, res) => {
    const itemId = Number(req.params.id);
    const { quantity, quantityToBuy } = req.body ?? {};
    await db.updateQuotationItemQuantities(itemId, {
      quantity,
      quantityToBuy,
    });
    res.json({ success: true });
  });

  router.post("/admin/access", async (req, res) => {
    const { quotationId, cnpj, companyName, daysValid = 14 } = req.body ?? {};
    if (!quotationId || !cnpj || !companyName) {
      return res.status(400).json({ error: "Dados incompletos" });
    }
    const password = crypto.randomBytes(8).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(daysValid));
    let supplier = await db.getSupplierByCnpjForQuotation(cnpj, quotationId);
    if (!supplier) {
      supplier = await db.createSupplier({
        cnpj,
        companyName,
        temporaryPassword: password,
        passwordExpiresAt: expiresAt,
        quotationId,
        isActive: true,
      });
    } else {
      await db.updateSupplierPassword(supplier.id, password, expiresAt, companyName);
      supplier = await db.getSupplierById(supplier.id);
    }
    if (!supplier) {
      return res.status(500).json({ error: "Falha ao criar fornecedor" });
    }
    const baseUrl = ENV.clientOrigin.replace(/\/+$/, "");
    const params = new URLSearchParams({
      quotationId: String(supplier.quotationId),
    });
    if (supplier.cnpj) {
      params.set("cnpj", supplier.cnpj);
    }
    if (supplier.companyName) {
      params.set("companyName", supplier.companyName);
    }
    params.set("password", password);
    const accessUrl = `${baseUrl}/supplier/access?${params.toString()}`;
    res.json({ success: true, password, expiresAt, accessUrl, supplier });
  });

  router.get("/admin/access", async (req, res) => {
    const quotationId = Number(req.query.quotationId);
    if (!quotationId) {
      return res.status(400).json({ error: "quotationId obrigatório" });
    }
    const suppliers = await db.getSuppliersByQuotation(quotationId);
    const baseUrl = ENV.clientOrigin.replace(/\/+$/, "");
    res.json(
      suppliers.map(supplier => ({
        id: supplier.id,
        cnpj: supplier.cnpj,
        companyName: supplier.companyName,
        expiresAt: supplier.passwordExpiresAt,
        password: supplier.temporaryPassword,
        accessUrl: `${baseUrl}/supplier/access?${new URLSearchParams({
          quotationId: String(supplier.quotationId),
          ...(supplier.cnpj ? { cnpj: supplier.cnpj } : {}),
          ...(supplier.companyName ? { companyName: supplier.companyName } : {}),
          ...(supplier.temporaryPassword ? { password: supplier.temporaryPassword } : {}),
        }).toString()}`,
        submittedAt: supplier.submittedAt,
      }))
    );
  });

  router.delete("/admin/access/:supplierId", async (req, res) => {
    const supplierId = Number(req.params.supplierId);
    if (!supplierId) {
      return res.status(400).json({ error: "supplierId obrigatório" });
    }
    await db.deleteSupplierById(supplierId);
    res.json({ success: true });
  });

  app.use("/api", router);
}
