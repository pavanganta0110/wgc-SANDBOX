import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  aggregateTransfers,
  aggregateDisputes,
  aggregateRefunds,
  aggregateAuthorizations,
  aggregateDeposits,
  getTransferVolumeTrend,
} from "../dashboardAggregates";
import { startOfDayCentral } from "@/lib/formatDateTimeCDT";

const churchId = "dashboard-aggregates-test-church";

async function cleanup() {
  await prisma.finixTransfer.deleteMany({ where: { churchId } });
  await prisma.finixDispute.deleteMany({ where: { churchId } });
  await prisma.finixRefundOrReversal.deleteMany({ where: { churchId } });
  await prisma.finixAuthorization.deleteMany({ where: { churchId } });
  await prisma.finixFundingTransferAttempt.deleteMany({ where: { churchId } });
  await prisma.church.deleteMany({ where: { id: churchId } });
}

describe("dashboardAggregates — correctness against a real database", () => {
  beforeEach(async () => {
    await cleanup();
    await prisma.church.create({
      data: {
        id: churchId,
        name: "Dashboard Aggregates Test Church",
        slug: "dashboard-aggregates-test",
        primaryContactEmail: "test@wgc.org",
        status: "ACTIVE",
        finixMerchantId: "mid-dashboard-aggregates-test",
      },
    });
  }, 30_000);

  afterEach(cleanup, 30_000);

  it("aggregateTransfers sums correctly and matches state case-insensitively", async () => {
    await prisma.finixTransfer.createMany({
      data: [
        // Uppercase SUCCEEDED
        ...[1000, 2000, 3000, 4000, 5000].map((amountCents, i) => ({
          churchId,
          finixTransferId: `tr_upper_${i}`,
          state: "SUCCEEDED",
          amountCents,
          createdAtFinix: new Date(),
        })),
        // lowercase "succeeded" — must still count (original code used .toUpperCase() === "SUCCEEDED")
        ...[100, 200].map((amountCents, i) => ({
          churchId,
          finixTransferId: `tr_lower_${i}`,
          state: "succeeded",
          amountCents,
          createdAtFinix: new Date(),
        })),
        // FAILED — must not count toward succeeded totals
        ...[999, 999, 999].map((amountCents, i) => ({
          churchId,
          finixTransferId: `tr_failed_${i}`,
          state: "FAILED",
          amountCents,
          createdAtFinix: new Date(),
        })),
      ],
    });

    const result = await aggregateTransfers({ churchId });
    expect(result.totalCount).toBe(10);
    expect(result.succeededCount).toBe(7);
    expect(result.succeededVolumeCents).toBe(15300);
  });

  it("aggregateDisputes counts active (pending) disputes case-insensitively", async () => {
    await prisma.finixDispute.createMany({
      data: [
        { churchId, finixDisputeId: "d1", state: "pending", amountCents: 100, createdAtFinix: new Date() },
        { churchId, finixDisputeId: "d2", state: "pending", amountCents: 200, createdAtFinix: new Date() },
        { churchId, finixDisputeId: "d3", state: "PENDING", amountCents: 300, createdAtFinix: new Date() },
        { churchId, finixDisputeId: "d4", state: "won", amountCents: 400, createdAtFinix: new Date() },
      ],
    });

    const result = await aggregateDisputes({ churchId });
    expect(result.totalCount).toBe(4);
    expect(result.totalVolumeCents).toBe(1000);
    expect(result.activeCount).toBe(3);
  });

  it("aggregateRefunds separates succeeded/failed and totals everything", async () => {
    await prisma.finixRefundOrReversal.createMany({
      data: [
        { churchId, finixReversalId: "r1", state: "SUCCEEDED", amountCents: 500, createdAtFinix: new Date() },
        { churchId, finixReversalId: "r2", state: "SUCCEEDED", amountCents: 500, createdAtFinix: new Date() },
        { churchId, finixReversalId: "r3", state: "succeeded", amountCents: 300, createdAtFinix: new Date() },
        { churchId, finixReversalId: "r4", state: "FAILED", amountCents: 111, createdAtFinix: new Date() },
        { churchId, finixReversalId: "r5", state: "FAILED", amountCents: 111, createdAtFinix: new Date() },
        { churchId, finixReversalId: "r6", state: "PENDING", amountCents: 50, createdAtFinix: new Date() },
      ],
    });

    const result = await aggregateRefunds({ churchId });
    expect(result.totalCount).toBe(6);
    expect(result.totalVolumeCents).toBe(1572);
    expect(result.succeededCount).toBe(3);
    expect(result.succeededVolumeCents).toBe(1300);
    expect(result.failedCount).toBe(2);
    expect(result.failedVolumeCents).toBe(222);
  });

  it("aggregateAuthorizations computes rate inputs and void totals independently of state", async () => {
    await prisma.finixAuthorization.createMany({
      data: [
        {
          churchId,
          finixAuthorizationId: "a1",
          state: "SUCCEEDED",
          amountRequestedCents: 1000,
          amountCents: 900,
          isVoid: true,
          createdAtFinix: new Date(),
        },
        {
          churchId,
          finixAuthorizationId: "a2",
          state: "SUCCEEDED",
          amountRequestedCents: 2000,
          amountCents: 1900,
          isVoid: false,
          createdAtFinix: new Date(),
        },
        {
          churchId,
          finixAuthorizationId: "a3",
          state: "SUCCEEDED",
          amountRequestedCents: 3000,
          amountCents: 2900,
          isVoid: false,
          createdAtFinix: new Date(),
        },
        {
          churchId,
          finixAuthorizationId: "a4",
          state: "FAILED",
          amountRequestedCents: 500,
          amountCents: null,
          isVoid: false,
          createdAtFinix: new Date(),
        },
        {
          churchId,
          finixAuthorizationId: "a5",
          state: "FAILED",
          amountRequestedCents: 600,
          amountCents: 450,
          isVoid: true,
          createdAtFinix: new Date(),
        },
      ],
    });

    const result = await aggregateAuthorizations({ churchId });
    expect(result.totalCount).toBe(5);
    expect(result.succeededCount).toBe(3);
    expect(result.requestedVolumeCents).toBe(7100);
    expect(result.voidedCount).toBe(2);
    expect(result.voidedVolumeCents).toBe(1350);
  });

  it("aggregateDeposits sums amountCents", async () => {
    await prisma.finixFundingTransferAttempt.createMany({
      data: [1000, 2000, 3000].map((amountCents, i) => ({
        churchId,
        finixFundingTransferAttemptId: `f${i}`,
        amountCents,
        createdAtFinix: new Date(),
      })),
    });

    const result = await aggregateDeposits({ churchId });
    expect(result.totalVolumeCents).toBe(6000);
  });

  it("getTransferVolumeTrend buckets sums by window and excludes rows outside every bucket", async () => {
    const todayStart = startOfDayCentral(new Date());
    const todayMid = new Date(todayStart.getTime() + 6 * 60 * 60 * 1000); // well inside "today"
    const twentyDaysAgo = new Date(todayStart.getTime() - 20 * 24 * 60 * 60 * 1000);

    await prisma.finixTransfer.createMany({
      data: [
        { churchId, finixTransferId: "trend_1", state: "SUCCEEDED", amountCents: 1000, createdAtFinix: todayMid },
        { churchId, finixTransferId: "trend_2", state: "SUCCEEDED", amountCents: 2000, createdAtFinix: todayMid },
        // Outside every 14-daily-bucket window — must not appear in any bucket's sum.
        { churchId, finixTransferId: "trend_3", state: "SUCCEEDED", amountCents: 9999999, createdAtFinix: twentyDaysAgo },
      ],
    });

    const buckets = Array.from({ length: 14 }).map((_, i) => {
      const idx = 13 - i;
      const start = new Date(todayStart);
      start.setDate(start.getDate() - idx);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end, label: String(idx) };
    });

    const sums = await getTransferVolumeTrend({ churchId }, buckets);
    expect(sums).toHaveLength(14);
    // Last bucket is "today".
    expect(sums[13]).toBe(30); // (1000 + 2000) cents -> dollars
    // Total across all buckets must not include the row from 20 days ago.
    const total = sums.reduce((a, b) => a + b, 0);
    expect(total).toBe(30);
  });
});
