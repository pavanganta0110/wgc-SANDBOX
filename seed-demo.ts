import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const churchId = "demo_church_123"
  
  // Clean up if exists
  await prisma.invoice.deleteMany({ where: { churchId } })
  await prisma.client.deleteMany({ where: { churchId } })
  await prisma.churchPricing.deleteMany({ where: { churchId } })
  await prisma.externalDonation.deleteMany({ where: { churchId } })
  await prisma.givingLink.deleteMany({ where: { churchId } })
  await prisma.finixSubscription.deleteMany({ where: { churchId } })
  await prisma.finixDispute.deleteMany({ where: { churchId } })
  await prisma.finixSettlement.deleteMany({ where: { churchId } })
  await prisma.finixRefundOrReversal.deleteMany({ where: { churchId } })
  await prisma.payment.deleteMany({ where: { id: { startsWith: 'demo_' } } })
  await prisma.finixTransfer.deleteMany({ where: { id: { startsWith: 'demo_' } } })
  await prisma.finixPaymentInstrumentSnapshot.deleteMany({ where: { finixPaymentInstrumentId: { startsWith: 'demo_' } } })
  await prisma.donor.deleteMany({ where: { id: { startsWith: 'demo_' } } })
  await prisma.user.deleteMany({ where: { email: "admin@gracecommunity.org" } })
  await prisma.church.deleteMany({ where: { id: churchId } })
  await prisma.onboardingApplication.deleteMany({ where: { id: `demo_onboarding_${churchId}` } })

  // Create Onboarding Application for the church
  const onboarding = await prisma.onboardingApplication.create({
    data: {
      id: `demo_onboarding_${churchId}`,
      organizationName: "Grace Community Church",
      organizationType: "NON_PROFIT",
      contactName: "Admin User",
      contactEmail: "admin@gracecommunity.org",
      status: "APPROVED",
      processingEnabled: true,
      hasAcceptedCreditCardsPreviously: true,
      finixMerchantId: "MU_test_123",
      finixIdentityId: "ID_test_123"
    }
  })

  // 1. Create Church
  const church = await prisma.church.create({
    data: {
      id: churchId,
      name: "Grace Community Church",
      slug: "grace-community",
      primaryContactEmail: "admin@gracecommunity.org",
      status: "ACTIVE",
      finixMerchantId: "MU_test_123",
      onboardingApplicationId: onboarding.id
    }
  })

  // Create ChurchPricing
  await prisma.churchPricing.create({
    data: {
      churchId: church.id,
      pricingPlanName: "Standard",
      cardPercentageFee: 2.9,
      cardFixedFeeCents: 30,
      achFixedFeeCents: 25,
    }
  })

  // 1. Create Team Users
  const user = await prisma.user.create({
    data: {
      id: "demo_user_123",
      email: "admin@gracecommunity.org",
      role: "owner",
      churchId: church.id,
      authVersion: 1,
    }
  })

  // 3. Create Donors
  const donors = []
  const names = ["Jonathan Doe", "Sarah Miller", "Michael Thompson", "Grace Family Trust", "Esther Williams"]
  for (let i=0; i<5; i++) {
    donors.push(await prisma.donor.create({
      data: {
        id: `demo_donor_${i}`,
        churchId: church.id,
        name: names[i],
        email: `donor${i}@example.com`,
      }
    }))
  }

  // 4. Create Instruments & Transfers
  for (let i=0; i<15; i++) {
    const donor = donors[i % 5]
    const instrumentId = `demo_inst_${i}`
    const transferId = `demo_tx_${i}`
    
    await prisma.finixPaymentInstrumentSnapshot.create({
      data: {
        finixPaymentInstrumentId: instrumentId,
        churchId: church.id,
        donorId: donor.id,
        paymentMethodType: "PAYMENT_CARD",
        cardBrand: i % 2 === 0 ? "VISA" : "MASTERCARD",
        cardLast4: `100${i % 5}`,
        cardExpirationMonth: 12,
        cardExpirationYear: 2028,
        accountHolderName: donor.name,
      }
    })

    const createdAt = new Date(Date.now() - (i * 86400000 * 2)) // Spread over last month

    await prisma.finixTransfer.create({
      data: {
        id: transferId,
        churchId: church.id,
        finixTransferId: transferId,
        createdAtFinix: createdAt,
        updatedAtFinix: createdAt,
        amountCents: (i + 1) * 5000, // $50 to $750
        currency: "USD",
        state: "SUCCEEDED",
        source: instrumentId,
        finixPaymentInstrumentId: instrumentId,
      }
    })

    await prisma.payment.create({
      data: {
        id: `demo_payment_${i}`,
        churchId: church.id,
        donorId: donor.id,
        finixTransferId: transferId,
        fundName: i % 3 === 0 ? "General Giving" : "Missions",
        amountCents: (i + 1) * 5000,
        createdAt: createdAt,
        status: "SUCCEEDED",
        paymentMethodType: "CARD"
      }
    })
  }

  // 5. Create Refunds, Disputes, Bank Returns
  for (let i = 0; i < 2; i++) {
    const txId = `demo_tx_${i}`; // reuse first 2 tx
    
    // Refund
    await prisma.finixRefundOrReversal.create({
      data: {
        id: `demo_refund_${i}`,
        churchId: church.id,
        finixReversalId: `demo_refund_${i}`,
        finixOriginalTransferId: txId,
        amountCents: 5000,
        state: "SUCCEEDED",
      }
    });

    // Dispute
    await prisma.finixDispute.create({
      data: {
        id: `demo_dispute_${i}`,
        churchId: church.id,
        finixDisputeId: `demo_dispute_${i}`,
        finixTransferId: txId,
        amountCents: 5000,
        state: "WON",
      }
    });
  }

  // Bank Return
  await prisma.finixTransfer.create({
    data: {
      id: "demo_tx_return_1",
      churchId: church.id,
      finixTransferId: "demo_tx_return_1",
      amountCents: 25000,
      currency: "USD",
      state: "FAILED",
      subtype: "RETURN",
      source: "demo_inst_1",
      finixPaymentInstrumentId: "demo_inst_1",
    }
  });

  // 6. Create Settlements
  for (let i = 0; i < 3; i++) {
    await prisma.finixSettlement.create({
      data: {
        id: `demo_settlement_${i}`,
        churchId: church.id,
        finixSettlementId: `demo_settlement_${i}`,
        state: "COMPLETED",
        totalAmountCents: 150000 + (i * 10000),
        netAmountCents: 145000 + (i * 10000),
        transactionCount: 20 + i,
      }
    });
  }

  // 7. Create Subscriptions (Recurring)
  for (let i = 0; i < 3; i++) {
    await prisma.finixSubscription.create({
      data: {
        id: `demo_sub_${i}`,
        churchId: church.id,
        donorId: donors[i].id,
        finixSubscriptionId: `demo_sub_${i}`,
        churchSubscriptionId: `demo_sub_${i}`,
        fundName: "General Giving"
      }
    });
  }

  // 8. Create Giving Links
  for (let i = 0; i < 2; i++) {
    await prisma.givingLink.create({
      data: {
        id: `demo_link_${i}`,
        churchId: church.id,
        publicSlug: `demo-link-${i}`,
        internalName: `Weekend Service ${i+1}`,
        publicTitle: `Donate to Weekend Service ${i+1}`,
        status: "ACTIVE",
        amountType: "VARIABLE",
        linkType: "MULTI_USE",
        allowedPaymentMethodsJson: ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"],
      }
    });
  }

  // 9. Create External Donations
  for (let i = 0; i < 3; i++) {
    await prisma.externalDonation.create({
      data: {
        id: `demo_ext_${i}`,
        churchId: church.id,
        donorId: donors[i].id,
        donationAmountCents: 10000 + (i * 5000),
        donationDate: new Date(),
        paymentMethod: "CASH",
        source: "WGC_MERCHANT_DASHBOARD"
      }
    });
  }

  // 10. Create Clients and Invoices
  for (let i = 0; i < 2; i++) {
    const client = await prisma.client.create({
      data: {
        id: `demo_client_${i}`,
        churchId: church.id,
        clientType: "INDIVIDUAL",
        firstName: `Demo`,
        lastName: `Client ${i}`,
        displayName: `Demo Client ${i}`,
        email: `client${i}@example.com`,
      }
    });

    await prisma.invoice.create({
      data: {
        id: `demo_invoice_${i}`,
        churchId: church.id,
        invoiceNumber: `INV-${1000 + i}`,
        clientId: client.id,
        status: "SENT",
        classification: "CHARITABLE_DONATION",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 86400000 * 30),
        totalCents: 50000 + (i * 25000),
        balanceCents: 50000 + (i * 25000),
      }
    });
  }

  console.log("Demo seed successful!")
}

main().catch(console.error).finally(() => prisma.$disconnect())
