const fs = require('fs');
const routePath = 'src/app/api/give/[slug]/route.ts';
let content = fs.readFileSync(routePath, 'utf8');
content = content.replace(
  'const { slug } = await params;',
  `const { slug } = await params;
  const correlationId = crypto.randomUUID();
  const logEvent = (checkpoint, data) => {
    console.log(JSON.stringify({
      checkpoint,
      correlationId,
      slug,
      timestamp: new Date().toISOString(),
      ...data
    }));
  };`
);
content = content.replace(
  'const body = await req.json();',
  `const body = await req.json();
    logEvent("1_DONATION_REQUEST_RECEIVED", {
      donationAmountCents: body.donationAmountCents,
      paymentMethod: body.paymentMethod,
      donorCoversFee: body.coverFees
    });`
);
content = content.replace(
  'const finixMerchantId = church.finixMerchantId;',
  `const finixMerchantId = church.finixMerchantId;
    logEvent("2_INPUT_VALIDATION_PASSED", { churchId: church.id, givingPageId: givingPage.id });`
);
content = content.replace(
  '// 2. Perform Fee Calculation',
  `logEvent("3_PAYMENT_INSTRUMENT_CREATED", { identityId, instrumentId });
    // 2. Perform Fee Calculation`
);
content = content.replace(
  `    const feeStrategy = resolveWgcTransferFeeStrategy({
      donationAmountCents,
      paymentMethod: method === "bank" ? "ACH" : "CARD",
      cardBrand,
      donorCoversFee: coverFees,
    });`,
  `    logEvent("4_FEE_STRATEGY_CALCULATED", { cardBrand });
    let feeStrategy;
    try {
      logEvent("5_FEE_PROFILE_CONFIGURATION_LOADED", {});
      feeStrategy = resolveWgcTransferFeeStrategy({
        donationAmountCents,
        paymentMethod: method === "bank" ? "ACH" : "CARD",
        cardBrand,
        donorCoversFee: coverFees,
      });
      logEvent("6_FEE_PROFILE_VALIDATION_PASSED", {
        feeProfileCategory: feeStrategy.feePaidBy === "DONOR" ? "ZERO" : "ORGANIZATION_PAID",
        calculatedFee: feeStrategy.expectedFeeCents
      });
    } catch (err: any) {
      if (err.message?.includes("Missing fee profile")) {
        return NextResponse.json({
          success: false,
          code: "PAYMENT_CONFIGURATION_ERROR",
          message: "Payments are temporarily unavailable. No charge was made.",
          reference: correlationId
        }, { status: 503 });
      }
      throw err;
    }`
);
content = content.replace(
  '    const transfer = await finixClient.createTransfer(transferPayload);',
  `    logEvent("7_FINIX_TRANSFER_REQUEST_START", {
      amount: transferPayload.amount,
      fee_profile: transferPayload.fee_profile,
      supplemental_fee: transferPayload.supplemental_fee,
      feePaidBy: feeStrategy.feePaidBy
    });
    const transfer = await finixClient.createTransfer(transferPayload);
    logEvent("8_FINIX_TRANSFER_RESPONSE_RECEIVED", { transferId: transfer.id, state: transfer.state });`
);
content = content.replace(
  '    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";',
  `    logEvent("9_PAYMENT_DATABASE_SAVE_COMPLETED", { paymentId: newPayment.id });
    const succeeded = (transfer.state || "").toUpperCase() === "SUCCEEDED";`
);
content = content.replace(
  '    return NextResponse.json({',
  `    logEvent("10_DONATION_RESPONSE_RETURNED", {});
    return NextResponse.json({`
);
fs.writeFileSync(routePath, content);
