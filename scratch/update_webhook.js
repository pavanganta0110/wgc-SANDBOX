const fs = require('fs');
const routePath = 'src/app/api/webhooks/finix/route.ts';
let content = fs.readFileSync(routePath, 'utf8');

// Insert Payment status update and email send after upserting finixTransfer
const target = `      update: {
        churchId: churchId ?? undefined,
        state: data.state ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });`;

const replacement = `      update: {
        churchId: churchId ?? undefined,
        state: data.state ?? null,
        failureCode: data.failure_code ?? null,
        failureMessage: data.failure_message ?? null,
        rawJsonRedacted: redactFinixPayload(data),
        updatedAtFinix: data.updated_at ? new Date(data.updated_at) : occurredAt,
        lastSyncedAt: new Date(),
      },
    });

    if (churchId && data.id) {
      const priorPayment = await prisma.payment.findFirst({
        where: { finixTransferId: data.id },
      });
      if (priorPayment && priorPayment.status !== (data.state || "PENDING").toUpperCase()) {
        await prisma.payment.updateMany({
          where: { finixTransferId: data.id },
          data: { status: (data.state || "PENDING").toUpperCase() },
        });

        if (
          priorPayment.status !== "SUCCEEDED" &&
          (data.state || "").toUpperCase() === "SUCCEEDED"
        ) {
          try {
            const { sendDonationReceipt } = await import("@/lib/giving/generateReceipt");
            await sendDonationReceipt(priorPayment.id, churchId);
          } catch (err) {
            console.error("Failed to send async donation receipt:", err);
          }
        }
      }
    }`;

content = content.replace(target, replacement);

fs.writeFileSync(routePath, content);
