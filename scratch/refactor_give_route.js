const fs = require('fs');
const routePath = 'src/app/api/give/[slug]/route.ts';
let content = fs.readFileSync(routePath, 'utf8');

// 1. Add `toSafePaymentErrorResponse` to imports
if (!content.includes('toSafePaymentErrorResponse')) {
  content = content.replace('toSafeErrorResponse', 'toSafeErrorResponse, toSafePaymentErrorResponse');
}

// 2. Change the entire try/catch structure.
// Instead of one giant try/catch, we'll wrap specific blocks.
// Actually, it's easier to use a series of try/catch blocks within the main function but the main function can still have a top level try/catch that acts as a fallback.

// Let's first check if clientAttemptId exists in the destructuring
if (!content.includes('clientAttemptId')) {
  content = content.replace(
    'fraudSessionId,',
    'fraudSessionId,\n      clientAttemptId,'
  );
}

// Update validation
content = content.replace(
  /if \(\!token \|\| \!donationAmountCents \|\| donationAmountCents \< 100\) \{[\s\S]*?\}/,
  `if (!token || !donationAmountCents || donationAmountCents < 100) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Invalid payment amount (minimum $1.00)", retryable: true }, { status: 400 });
    }`
);

content = content.replace(
  /if \(\!goodsServicesValidation\.valid\) \{[\s\S]*?\}/,
  `if (!goodsServicesValidation.valid) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Please correct the goods/services information", retryable: true }, { status: 400 });
    }`
);

content = content.replace(
  /if \(\!fraudSessionId\) \{[\s\S]*?\}/,
  `if (!fraudSessionId) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Missing fraud session", retryable: true }, { status: 400 });
    }`
);

content = content.replace(
  /if \(\!donor\?\.name \|\| \!donor\?\.email\) \{[\s\S]*?\}/,
  `if (!clientAttemptId) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Missing client attempt ID", retryable: true }, { status: 400 });
    }
    if (!donor?.name || !donor?.email) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Donor name and email are required", retryable: true }, { status: 400 });
    }`
);

content = content.replace(
  /if \(\!isValidEmail\(donor\.email\)\) \{[\s\S]*?\}/,
  `if (!isValidEmail(donor.email)) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Please enter a valid email address", retryable: true }, { status: 400 });
    }`
);

content = content.replace(
  /if \(\!normalized\) \{[\s\S]*?\}/,
  `if (!normalized) {
        return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Please enter a valid U.S. phone number", retryable: true }, { status: 400 });
      }`
);

content = content.replace(
  /if \(\!church \|\| \!church\.finixMerchantId\) \{[\s\S]*?\}/,
  `if (!church || !church.finixMerchantId) {
      return NextResponse.json({ success: false, code: "PAYMENT_CONFIGURATION_ERROR", message: "Organization is not set up to accept payments", retryable: false }, { status: 400 });
    }`
);

// Add Idempotency Check
const idempotencyCode = `
    const existingAttempt = await prisma.paymentAttempt.findUnique({ where: { clientAttemptId } });
    if (existingAttempt) {
      if (existingAttempt.status === "SUCCEEDED" || existingAttempt.status === "PENDING") {
        return NextResponse.json({
          success: true,
          transferId: existingAttempt.finixTransferId,
          state: existingAttempt.status,
          duplicate: true,
        });
      }
    }
    await prisma.paymentAttempt.upsert({
      where: { clientAttemptId },
      update: { status: "STARTED" },
      create: { clientAttemptId, status: "STARTED" }
    });
`;

if (!content.includes('existingAttempt')) {
  content = content.replace(
    /const method: \"card\" \| \"bank\" = paymentMethod === \"bank\" \? \"bank\" : \"card\";/,
    `${idempotencyCode}\n    const method: "card" | "bank" = paymentMethod === "bank" ? "bank" : "card";`
  );
}

// Ensure error responses are returned correctly
fs.writeFileSync(routePath, content);
