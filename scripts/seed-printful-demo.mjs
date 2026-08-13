/**
 * Sandbox-only demo seeder for the Printful/merchandise integration (spec
 * item 68). Run manually against the SANDBOX database only:
 *
 *   set -a; source .env.local; set +a
 *   node scripts/seed-printful-demo.mjs [churchId]
 *
 * If churchId is omitted, the first Church with a finixMerchantId is used
 * (any already-provisioned sandbox test church). Also finds/creates a
 * GivingLink for that church, connects a mock Printful store, syncs the
 * same 3 mock products used by MockPrintfulProvider, enables them for
 * giving-page display, assigns them to the giving link, and creates one
 * sample order already marked SHIPPED with tracking so the demo has real
 * data to look at immediately.
 *
 * Plain @prisma/client usage (no @/ path aliases) so this runs directly
 * with `node`, matching the other ad-hoc scripts used during this build
 * (no ts-node/tsx configured in this repo).
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const PLACEHOLDER = (label, bg) => `https://placehold.co/600x600/${bg}/ffffff?text=${encodeURIComponent(label)}`;

function mockCatalog() {
  const shirtBlack = PLACEHOLDER("Ministry Tee - Black", "1f2937");
  const shirtWhite = PLACEHOLDER("Ministry Tee - White", "e5e7eb");
  const hoodie = PLACEHOLDER("Ministry Hoodie", "374151");
  const hat = PLACEHOLDER("Church Hat", "b45309");
  return [
    {
      externalProductId: "mock-product-tshirt",
      name: "WGC Ministry T-Shirt",
      description: "Soft cotton-blend tee. Sandbox mock product.",
      thumbnailUrl: shirtBlack,
      primaryImageUrl: shirtBlack,
      variants: [
        { externalVariantId: "mock-tshirt-s-black", name: "Small / Black", size: "S", color: "Black", providerCost: 1050, merchantPrice: 2500, imageUrl: shirtBlack },
        { externalVariantId: "mock-tshirt-m-black", name: "Medium / Black", size: "M", color: "Black", providerCost: 1050, merchantPrice: 2500, imageUrl: shirtBlack },
        { externalVariantId: "mock-tshirt-l-black", name: "Large / Black", size: "L", color: "Black", providerCost: 1050, merchantPrice: 2500, imageUrl: shirtBlack },
        { externalVariantId: "mock-tshirt-xl-black", name: "XL / Black", size: "XL", color: "Black", providerCost: 1150, merchantPrice: 2500, imageUrl: shirtBlack },
        { externalVariantId: "mock-tshirt-s-white", name: "Small / White", size: "S", color: "White", providerCost: 1050, merchantPrice: 2500, imageUrl: shirtWhite },
        { externalVariantId: "mock-tshirt-m-white", name: "Medium / White", size: "M", color: "White", providerCost: 1050, merchantPrice: 2500, imageUrl: shirtWhite },
        { externalVariantId: "mock-tshirt-l-white", name: "Large / White", size: "L", color: "White", providerCost: 1050, merchantPrice: 2500, imageUrl: shirtWhite },
        { externalVariantId: "mock-tshirt-xl-white", name: "XL / White", size: "XL", color: "White", providerCost: 1150, merchantPrice: 2500, imageUrl: shirtWhite },
      ],
    },
    {
      externalProductId: "mock-product-hoodie",
      name: "Ministry Hoodie",
      description: "Heavyweight fleece hoodie. Sandbox mock product.",
      thumbnailUrl: hoodie,
      primaryImageUrl: hoodie,
      variants: [
        { externalVariantId: "mock-hoodie-s", name: "Small", size: "S", providerCost: 2200, merchantPrice: 4500, imageUrl: hoodie },
        { externalVariantId: "mock-hoodie-m", name: "Medium", size: "M", providerCost: 2200, merchantPrice: 4500, imageUrl: hoodie },
        { externalVariantId: "mock-hoodie-l", name: "Large", size: "L", providerCost: 2200, merchantPrice: 4500, imageUrl: hoodie },
        { externalVariantId: "mock-hoodie-xl", name: "XL", size: "XL", providerCost: 2350, merchantPrice: 4500, imageUrl: hoodie },
      ],
    },
    {
      externalProductId: "mock-product-hat",
      name: "Church Hat",
      description: "Adjustable embroidered cap. Sandbox mock product.",
      thumbnailUrl: hat,
      primaryImageUrl: hat,
      variants: [{ externalVariantId: "mock-hat-one-size", name: "One Size", providerCost: 950, merchantPrice: 2200, imageUrl: hat }],
    },
  ];
}

async function main() {
  const churchIdArg = process.argv[2];
  const church = churchIdArg
    ? await prisma.church.findUnique({ where: { id: churchIdArg } })
    : await prisma.church.findFirst({ where: { finixMerchantId: { not: null } }, orderBy: { createdAt: "desc" } });

  if (!church) {
    console.error("No church found. Pass a churchId explicitly: node scripts/seed-printful-demo.mjs <churchId>");
    process.exit(1);
  }
  console.log(`Seeding Printful demo data for church: ${church.name} (${church.id})`);

  let link = await prisma.givingLink.findFirst({ where: { churchId: church.id }, orderBy: { createdAt: "desc" } });
  if (!link) {
    link = await prisma.givingLink.create({
      data: {
        churchId: church.id,
        publicSlug: `demo-merch-${crypto.randomBytes(4).toString("hex")}`,
        internalName: "Printful Demo Giving Page",
        publicTitle: "Support Our Ministry",
        status: "ACTIVE",
        amountType: "VARIABLE",
        allowCustomAmount: true,
      },
    });
    console.log(`  Created demo giving link: /${link.publicSlug}`);
  }

  const connection = await prisma.printfulConnection.upsert({
    where: { churchId: church.id },
    create: { churchId: church.id, status: "CONNECTED", connectionType: "mock", printfulStoreId: `mock-store-${church.id.slice(0, 8)}`, printfulAccountId: `mock-account-${church.id.slice(0, 8)}`, lastConnectedAt: new Date() },
    update: { status: "CONNECTED", connectionType: "mock", disconnectedAt: null, lastConnectedAt: new Date() },
  });
  await prisma.merchandiseSettings.upsert({ where: { churchId: church.id }, create: { churchId: church.id, enabled: true, showMerchandiseOnGivingPages: true }, update: { enabled: true, showMerchandiseOnGivingPages: true } });
  console.log("  Printful connected (mock).");

  const productRows = [];
  for (const product of mockCatalog()) {
    const row = await prisma.merchandiseProduct.upsert({
      where: { churchId_provider_externalProductId: { churchId: church.id, provider: "PRINTFUL", externalProductId: product.externalProductId } },
      create: { churchId: church.id, printfulConnectionId: connection.id, provider: "PRINTFUL", externalProductId: product.externalProductId, name: product.name, description: product.description, thumbnailUrl: product.thumbnailUrl, primaryImageUrl: product.primaryImageUrl, active: true, visibleOnGivingPage: true, syncStatus: "SYNCED", lastSyncedAt: new Date() },
      update: { name: product.name, description: product.description, active: true, visibleOnGivingPage: true, syncStatus: "SYNCED", lastSyncedAt: new Date() },
    });
    for (const v of product.variants) {
      await prisma.merchandiseVariant.upsert({
        where: { churchId_productId_externalVariantId: { churchId: church.id, productId: row.id, externalVariantId: v.externalVariantId } },
        create: { churchId: church.id, productId: row.id, externalVariantId: v.externalVariantId, sku: `MOCK-${v.externalVariantId}`, name: v.name, size: v.size, color: v.color, imageUrl: v.imageUrl, providerCost: v.providerCost, merchantPrice: v.merchantPrice, available: true, stockStatus: "IN_STOCK", lastSyncedAt: new Date() },
        update: { providerCost: v.providerCost, lastSyncedAt: new Date() },
      });
    }
    productRows.push(row);
    console.log(`  Synced product: ${product.name} (${product.variants.length} variants)`);
  }

  await prisma.givingLink.update({ where: { id: link.id }, data: { merchandiseEnabled: true } });
  await prisma.givingPageMerchandise.deleteMany({ where: { givingPageId: link.id } });
  for (const [index, row] of productRows.entries()) {
    await prisma.givingPageMerchandise.create({ data: { churchId: church.id, givingPageId: link.id, productId: row.id, enabled: true, displayOrder: index, featured: index === 0 } });
  }
  console.log(`  Merchandise enabled on giving page: /${link.publicSlug}`);

  // One sample already-shipped order so the merchant dashboard has
  // something to show immediately.
  const shirt = productRows[0];
  const shirtVariant = await prisma.merchandiseVariant.findFirst({ where: { productId: shirt.id } });
  const wgcOrderNumber = `WGC-MERCH-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const order = await prisma.merchandiseOrder.create({
    data: {
      churchId: church.id,
      givingPageId: link.id,
      wgcOrderNumber,
      printfulConnectionId: connection.id,
      status: "SHIPPED",
      fulfillmentStatus: "FULFILLED",
      paymentStatus: "SUCCEEDED",
      customerEmail: "demo-donor@example.com",
      shippingName: "Demo Donor",
      shippingAddress1: "123 Main St",
      shippingCity: "Austin",
      shippingState: "TX",
      shippingPostalCode: "78701",
      shippingCountry: "USA",
      subtotal: shirtVariant.merchantPrice,
      shippingAmount: 599,
      totalMerchandiseAmount: shirtVariant.merchantPrice + 599,
      providerCost: shirtVariant.providerCost,
      merchantRevenue: shirtVariant.merchantPrice - shirtVariant.providerCost,
      clientAttemptId: crypto.randomUUID(),
      externalOrderId: `mockorder-demo-${crypto.randomBytes(4).toString("hex")}`,
      trackingNumber: "MOCKTRACKDEMO1234",
      trackingUrl: "https://example-carrier.test/track/MOCKTRACKDEMO1234",
      carrier: "Mock Carrier",
      placedAt: new Date(Date.now() - 5 * 86400000),
      submittedToProviderAt: new Date(Date.now() - 5 * 86400000),
      shippedAt: new Date(Date.now() - 2 * 86400000),
      items: { create: [{ churchId: church.id, productId: shirt.id, variantId: shirtVariant.id, externalVariantId: shirtVariant.externalVariantId, productName: shirt.name, variantName: shirtVariant.name, size: shirtVariant.size, color: shirtVariant.color, sku: shirtVariant.sku, quantity: 1, unitPrice: shirtVariant.merchantPrice, lineTotal: shirtVariant.merchantPrice, providerUnitCost: shirtVariant.providerCost, providerLineCost: shirtVariant.providerCost, imageUrl: shirtVariant.imageUrl }] },
    },
  });
  console.log(`  Created sample shipped order: ${order.wgcOrderNumber}`);

  console.log("\nDone. Open the giving page:");
  console.log(`  http://localhost:3000/g/${link.publicSlug}`);
  console.log("Or the merchant dashboard:");
  console.log(`  /merchant/merchandise  and  /merchant/merchandise/orders`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
