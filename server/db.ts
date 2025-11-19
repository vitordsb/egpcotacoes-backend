import { MongoClient, type Db, type Collection, type Document, type ModifyResult } from "mongodb";
import {
  InsertQuotation,
  InsertQuotationItem,
  InsertSupplier,
  InsertSupplierQuote,
  InsertUser,
  Quotation,
  QuotationItem,
  QuoteHistory,
  Supplier,
  SupplierQuote,
  SupplierObservation,
  InsertSupplierObservation,
  User,
} from "../shared/database.js";
import { ENV } from "./_core/env.js";
import { DEFAULT_QUOTATION_ITEMS } from "./constants/defaultQuotationItems.js";

type CounterDocument = { _id: string; seq: number };

let client: MongoClient | null = null;
let database: Db | null = null;
let connectPromise: Promise<Db> | null = null;

async function connectToDatabase(): Promise<Db> {
  if (database) return database;
  if (connectPromise) return connectPromise;
  if (!ENV.databaseUrl) {
    throw new Error("DATABASE_URL is required to establish a MongoDB connection");
  }

  client ??= new MongoClient(ENV.databaseUrl);
  connectPromise = client
    .connect()
    .then(() => {
      database = client!.db();
      console.log("[Database] Connected to MongoDB");
      return database;
    })
    .catch(error => {
      console.error("[Database] Failed to connect:", error);
      database = null;
      connectPromise = null;
      throw error;
    });
  return connectPromise;
}

async function getCollection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await connectToDatabase();
  return db.collection<T>(name);
}

async function getNextSequence(sequenceName: string): Promise<number> {
  const counters = await getCollection<CounterDocument>("counters");
  const result = (await counters.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  )) as unknown as ModifyResult<CounterDocument>;
  let updated = result.value;
  if (!updated) {
    updated = await counters.findOne({ _id: sequenceName }) as CounterDocument | null;
  }
  if (!updated) {
    throw new Error(`Failed to increment sequence for ${sequenceName}`);
  }
  return updated.seq;
}

export async function getDb(): Promise<Db> {
  return connectToDatabase();
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const usersCollection = await getCollection<User>("users");
  const existing = await usersCollection.findOne({ openId: user.openId });
  const now = new Date();

  const baseUpdates: Partial<User> = {
    updatedAt: now,
    lastSignedIn: user.lastSignedIn ?? now,
  };

  const copyNullableField = <K extends keyof InsertUser>(key: K) => {
    if (user[key] !== undefined) {
      (baseUpdates as any)[key] = user[key] ?? null;
    }
  };

  copyNullableField("name");
  copyNullableField("email");
  copyNullableField("loginMethod");

  if (user.role !== undefined) {
    baseUpdates.role = user.role;
  } else if (!existing && user.openId === ENV.ownerOpenId) {
    baseUpdates.role = "admin";
  }

  if (existing) {
    await usersCollection.updateOne(
      { openId: user.openId },
      { $set: baseUpdates }
    );
    return;
  }

  const newUser: User = {
    id: await getNextSequence("users"),
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: baseUpdates.role ?? "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: baseUpdates.lastSignedIn ?? now,
  };

  await usersCollection.insertOne(newUser);
}

export async function getUserByOpenId(openId: string) {
  const usersCollection = await getCollection<User>("users");
  return usersCollection.findOne({ openId });
}

// Helpers para fornecedores
export async function createSupplier(data: InsertSupplier) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  const now = new Date();
  const supplier: Supplier = {
    id: await getNextSequence("suppliers"),
    cnpj: data.cnpj,
    companyName: data.companyName,
    temporaryPassword: data.temporaryPassword,
    passwordExpiresAt: data.passwordExpiresAt,
    isActive: data.isActive ?? true,
    quotationId: data.quotationId,
    submittedAt: data.submittedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await suppliersCollection.insertOne(supplier);
  return supplier;
}

export async function getSupplierByCNPJ(cnpj: string) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  return (await suppliersCollection.findOne({ cnpj })) as Supplier | null;
}

export async function getSupplierByCnpjForQuotation(
  cnpj: string,
  quotationId: number
) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  return (await suppliersCollection.findOne({ cnpj, quotationId })) as Supplier | null;
}

export async function getSupplierByCnpjAndPassword(
  cnpj: string,
  password: string
) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  return (await suppliersCollection.findOne({
    cnpj,
    temporaryPassword: password,
  })) as Supplier | null;
}

export async function getSuppliersByQuotation(quotationId: number) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  return (await suppliersCollection.find({ quotationId }).sort({ createdAt: -1 }).toArray()) as Supplier[];
}

export async function getSupplierById(id: number) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  return (await suppliersCollection.findOne({ id })) as Supplier | null;
}

export async function deleteSupplierById(id: number) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  const quotesCollection = await getCollection<SupplierQuote>("supplierQuotes");
  const observationsCollection = await getCollection<SupplierObservation>("supplierObservations");
  const historyCollection = await getCollection<QuoteHistory>("quoteHistory");

  await quotesCollection.deleteMany({ supplierId: id });
  await observationsCollection.deleteMany({ supplierId: id });
  await historyCollection.deleteMany({ supplierId: id });
  await suppliersCollection.deleteOne({ id });
}

export async function updateSupplierPassword(
  id: number,
  password: string,
  expiresAt: Date,
  companyName?: string
) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  const updateData: Partial<Supplier> = {
    temporaryPassword: password,
    passwordExpiresAt: expiresAt,
    updatedAt: new Date(),
  };
  if (companyName) {
    updateData.companyName = companyName;
  }
  await suppliersCollection.updateOne(
    { id },
    {
      $set: updateData,
    }
  );
}

export async function markSupplierSubmission(id: number, submitted: boolean) {
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  await suppliersCollection.updateOne(
    { id },
    {
      $set: {
        submittedAt: submitted ? new Date() : null,
        updatedAt: new Date(),
      },
    }
  );
}

// Helpers para cotações
export async function createQuotation(data: InsertQuotation) {
  const quotationsCollection = await getCollection<Quotation>("quotations");
  const now = new Date();
  const quotation: Quotation = {
    id: await getNextSequence("quotations"),
    title: data.title,
    description: data.description ?? null,
    status: data.status ?? "active",
    expiresAt: data.expiresAt,
    createdAt: now,
    updatedAt: now,
  };
  await quotationsCollection.insertOne(quotation);
  return quotation;
}

export async function getQuotationById(id: number) {
  const quotationsCollection = await getCollection<Quotation>("quotations");
  return quotationsCollection.findOne({ id });
}

export async function getAllQuotations() {
  const quotationsCollection = await getCollection<Quotation>("quotations");
  return quotationsCollection.find().sort({ createdAt: 1 }).toArray();
}

export async function updateQuotationStatus(id: number, status: string) {
  const quotationsCollection = await getCollection<Quotation>("quotations");
  await quotationsCollection.updateOne(
    { id },
    { $set: { status: status as Quotation["status"], updatedAt: new Date() } }
  );
}

export async function updateQuotationDetails(
  id: number,
  data: Partial<Pick<Quotation, "title" | "description" | "status" | "expiresAt">>
) {
  const quotationsCollection = await getCollection<Quotation>("quotations");
  await quotationsCollection.updateOne(
    { id },
    { $set: { ...data, updatedAt: new Date() } }
  );
}

export async function deleteQuotation(id: number) {
  const quotationsCollection = await getCollection<Quotation>("quotations");
  const quotationItemsCollection = await getCollection<QuotationItem>("quotationItems");
  const supplierQuotesCollection = await getCollection<SupplierQuote>("supplierQuotes");
  const suppliersCollection = await getCollection<Supplier>("suppliers");
  const historyCollection = await getCollection<QuoteHistory>("quoteHistory");
  const observationsCollection = await getCollection<SupplierObservation>("supplierObservations");

  await Promise.all([
    quotationItemsCollection.deleteMany({ quotationId: id }),
    supplierQuotesCollection.deleteMany({ quotationId: id }),
    suppliersCollection.deleteMany({ quotationId: id }),
    historyCollection.deleteMany({ quotationId: id }),
    observationsCollection.deleteMany({ quotationId: id }),
    quotationsCollection.deleteOne({ id }),
  ]);
}

// Helpers para itens de cotação
export async function createQuotationItem(data: InsertQuotationItem) {
  const quotationItemsCollection = await getCollection<QuotationItem>("quotationItems");
  const now = new Date();
  const item: QuotationItem = {
    id: await getNextSequence("quotationItems"),
    quotationId: data.quotationId,
    itemName: data.itemName,
    itemType: data.itemType,
    quantity: data.quantity,
    quantityToBuy: data.quantityToBuy,
    targetPrice: data.targetPrice ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await quotationItemsCollection.insertOne(item);
  return item;
}

export async function seedDefaultQuotationItems(quotationId: number) {
  for (const baseItem of DEFAULT_QUOTATION_ITEMS) {
    await createQuotationItem({
      quotationId,
      itemName: baseItem.itemName,
      itemType: baseItem.itemType,
      quantity: baseItem.quantity,
      quantityToBuy: baseItem.quantityToBuy,
      targetPrice: null,
    });
  }
}

export async function getQuotationItems(quotationId: number) {
  const quotationItemsCollection = await getCollection<QuotationItem>("quotationItems");
  let items = await quotationItemsCollection.find({ quotationId }).toArray();
  if (items.length === 0) {
    await seedDefaultQuotationItems(quotationId);
    items = await quotationItemsCollection.find({ quotationId }).toArray();
  }
  return items;
}

export async function updateQuotationItemTarget(itemId: number, targetPrice: number, itemName?: string) {
  const quotationItemsCollection = await getCollection<QuotationItem>("quotationItems");
  const filter: Record<string, any> = { id: itemId };
  if (itemName) {
    filter.itemName = itemName;
  }
  await quotationItemsCollection.updateOne(
    filter,
    { $set: { targetPrice: targetPrice.toString(), updatedAt: new Date() } }
  );
}

export async function updateQuotationItemQuantities(
  itemId: number,
  data: Partial<Pick<QuotationItem, "quantity" | "quantityToBuy">>
) {
  const quotationItemsCollection = await getCollection<QuotationItem>("quotationItems");
  await quotationItemsCollection.updateOne(
    { id: itemId },
    { $set: { ...data, updatedAt: new Date() } }
  );
}

// Helpers para respostas de fornecedores
export async function createSupplierQuote(data: InsertSupplierQuote) {
  const supplierQuotesCollection = await getCollection<SupplierQuote>("supplierQuotes");
  const now = new Date();
  const quote: SupplierQuote = {
    id: await getNextSequence("supplierQuotes"),
    quotationId: data.quotationId,
    supplierId: data.supplierId,
    quotationItemId: data.quotationItemId,
    priceInReal: data.priceInReal ?? null,
    priceInDollar: data.priceInDollar ?? null,
    exchangeRate: data.exchangeRate ?? null,
    ipiPercentage: data.ipiPercentage ?? null,
    icmsPercentage: data.icmsPercentage ?? null,
    finalPrice: data.finalPrice,
    submittedAt: data.submittedAt ?? now,
    createdAt: now,
    updatedAt: now,
  };
  await supplierQuotesCollection.insertOne(quote);
  return quote;
}

export async function getSupplierQuotes(quotationId: number, supplierId: number) {
  const supplierQuotesCollection = await getCollection<SupplierQuote>("supplierQuotes");
  return supplierQuotesCollection.find({ quotationId, supplierId }).toArray();
}

export async function getQuotationQuotes(quotationId: number) {
  const supplierQuotesCollection = await getCollection<SupplierQuote>("supplierQuotes");
  return supplierQuotesCollection.find({ quotationId }).toArray();
}

export async function updateSupplierQuote(id: number, data: Partial<SupplierQuote>) {
  const supplierQuotesCollection = await getCollection<SupplierQuote>("supplierQuotes");
  const updateData = { ...data } as Partial<SupplierQuote>;
  delete (updateData as Partial<SupplierQuote>).id;
  await supplierQuotesCollection.updateOne(
    { id },
    { $set: { ...updateData, updatedAt: new Date() } }
  );
}

// Observações por item
export async function upsertSupplierObservation(data: InsertSupplierObservation) {
  const observations = await getCollection<SupplierObservation>("supplierObservations");
  const now = new Date();
  const existing = await observations.findOne({
    quotationId: data.quotationId,
    supplierId: data.supplierId,
    quotationItemId: data.quotationItemId,
  });

  if (existing) {
    await observations.updateOne(
      { id: existing.id },
      { $set: { note: data.note, updatedAt: now } }
    );
    return existing.id;
  }

  const observation: SupplierObservation = {
    id: await getNextSequence("supplierObservations"),
    quotationId: data.quotationId,
    supplierId: data.supplierId,
    quotationItemId: data.quotationItemId,
    note: data.note,
    createdAt: now,
    updatedAt: now,
  };
  await observations.insertOne(observation);
  return observation.id;
}

export async function getSupplierObservationsByQuotation(quotationId: number) {
  const observations = await getCollection<SupplierObservation>("supplierObservations");
  return observations.find({ quotationId }).toArray();
}

export async function getSupplierObservationsForSupplier(quotationId: number, supplierId: number) {
  const observations = await getCollection<SupplierObservation>("supplierObservations");
  return observations.find({ quotationId, supplierId }).toArray();
}

// Helpers para histórico
export async function archiveQuotation(quotationId: number, supplierId: number) {
  const historyCollection = await getCollection<QuoteHistory>("quoteHistory");
  const quotes = await getSupplierQuotes(quotationId, supplierId);

  for (const quote of quotes) {
    const historyEntry: QuoteHistory = {
      id: await getNextSequence("quoteHistory"),
      quotationId: quote.quotationId,
      supplierId: quote.supplierId,
      quotationItemId: quote.quotationItemId,
      priceInReal: quote.priceInReal ?? null,
      priceInDollar: quote.priceInDollar ?? null,
      exchangeRate: quote.exchangeRate ?? null,
      ipiPercentage: quote.ipiPercentage ?? null,
      icmsPercentage: quote.icmsPercentage ?? null,
      finalPrice: quote.finalPrice,
      archivedAt: new Date(),
      createdAt: new Date(),
    };
    await historyCollection.insertOne(historyEntry);
  }
}
