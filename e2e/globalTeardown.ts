import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { loadDotEnvLocal } from "./loadEnv";

loadDotEnvLocal();

const FIXTURE_PATH = path.join(__dirname, ".fixtures.json");

export default async function globalTeardown() {
  if (!fs.existsSync(FIXTURE_PATH)) return;
  const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf-8"));
  const prisma = new PrismaClient();
  try {
    const invoiceIds = [fixtures.invoiceAId, fixtures.invoiceBId, fixtures.invoicePaidId];
    await prisma.invoicePayment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoicePaymentAttempt.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoicePublicToken.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceActivity.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.client.deleteMany({ where: { churchId: { in: [fixtures.churchAId, fixtures.churchBId] } } });
    await prisma.church.deleteMany({ where: { id: { in: [fixtures.churchAId, fixtures.churchBId] } } });
  } finally {
    await prisma.$disconnect();
    fs.unlinkSync(FIXTURE_PATH);
  }
}
