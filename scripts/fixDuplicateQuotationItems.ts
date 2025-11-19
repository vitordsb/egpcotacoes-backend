import "dotenv/config";
import { MongoClient } from "mongodb";

async function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not defined");
  }
  const client = new MongoClient(url);
  await client.connect();
  return { client, db: client.db() };
}

async function main() {
  const { client, db } = await getDatabase();
  try {
    const quotationItems = db.collection("quotationItems");
    const counters = db.collection("counters");
    const supplierQuotes = db.collection("supplierQuotes");

    const duplicates = await quotationItems
      .find({ id: 1 })
      .sort({ _id: 1 })
      .toArray();

    if (!duplicates.length) {
      console.log("[FixQuotationItems] No duplicated items found.");
      return;
    }

    console.log(`[FixQuotationItems] Found ${duplicates.length} duplicated items.`);

    for (const doc of duplicates) {
      const counterResult = await counters.findOneAndUpdate(
        { _id: "quotationItems" },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
      );
      let newId = counterResult.value?.seq;
      if (!newId) {
        const fallback = await counters.findOne({ _id: "quotationItems" });
        newId = fallback?.seq;
      }
      if (!newId) {
        throw new Error("Failed to generate a new sequence for quotationItems");
      }

      await quotationItems.updateOne(
        { _id: doc._id },
        {
          $set: {
            id: newId,
            updatedAt: new Date(),
          },
        }
      );

      console.log(
        `[FixQuotationItems] Updated item "${doc.itemName}" (quotation ${doc.quotationId}) to id ${newId}.`
      );
    }

    const removedQuotes = await supplierQuotes.deleteMany({ quotationItemId: 1 });
    if (removedQuotes.deletedCount) {
      console.log(
        `[FixQuotationItems] Removed ${removedQuotes.deletedCount} supplier quote(s) linked to duplicated items.`
      );
    } else {
      console.log("[FixQuotationItems] No supplier quotes referenced the duplicated ids.");
    }

    console.log("[FixQuotationItems] Completed successfully.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("[FixQuotationItems] Failed:", err);
  process.exit(1);
});
