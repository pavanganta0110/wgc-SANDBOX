export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  bodyHtml: string;
}

export const HELP_CATEGORIES = ["Giving Links", "Donors & Recurring Giving", "Payments & Deposits", "Receipts & Statements", "Insights & Reporting", "Payment Mode & Branding", "Account & Team"];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "creating-a-giving-link",
    title: "Creating a Giving Link",
    category: "Giving Links",
    bodyHtml: `<p>Giving Links are shareable donation pages you create for your organization. From <strong>Giving Links</strong>, select <strong>Create Giving Link</strong>, set a name, choose which funds donors can give to, and customize the suggested amounts. Once published, share the link's URL directly, or use the built-in share options.</p>`,
  },
  {
    slug: "editing-a-giving-link",
    title: "Editing an Existing Giving Link",
    category: "Giving Links",
    bodyHtml: `<p>Open the Giving Link from the list and select <strong>Edit</strong>. Changes to suggested amounts, funds, or branding take effect immediately for anyone who visits the link afterward — donors who already have the page open won't see the update until they reload it.</p>`,
  },
  {
    slug: "understanding-recurring-donors-vs-subscriptions",
    title: "Recurring Donors vs. Subscriptions — what's the difference?",
    category: "Donors & Recurring Giving",
    bodyHtml: `<p><strong>Recurring Donors</strong> lists each donor once, even if they have multiple recurring donations. <strong>Subscriptions</strong> lists each individual recurring donation schedule separately — a donor with 3 recurring gifts appears once on Recurring Donors and 3 times on Subscriptions. Use Recurring Donors for a donor-level view, and Subscriptions to manage individual schedules.</p>`,
  },
  {
    slug: "creating-a-subscription-for-a-donor",
    title: "Setting Up a Recurring Donation on Behalf of a Donor",
    category: "Donors & Recurring Giving",
    bodyHtml: `<p>From <strong>Subscriptions</strong>, select <strong>Create Subscription</strong>. You can either select a donor's existing enabled payment method (with documented consent) or send them a secure setup link to enter their own payment details. Raw card and bank account numbers are never entered by an Organization Admin — they're always collected directly from the donor through a secure, encrypted form.</p>`,
  },
  {
    slug: "why-did-a-recurring-payment-fail",
    title: "Why did a recurring payment fail?",
    category: "Donors & Recurring Giving",
    bodyHtml: `<p>Recurring payments most commonly fail due to an expired card, insufficient funds, or a closed bank account. Open the subscription's detail page to see the failure reason. You can send the donor a secure payment update link so they can update their payment method themselves.</p>`,
  },
  {
    slug: "understanding-settlements-and-deposits",
    title: "Understanding Settlements and Deposits",
    category: "Payments & Deposits",
    bodyHtml: `<p>A <strong>Settlement</strong> is a batch of processed payments and fees that gets totaled for payout. A <strong>Deposit</strong> is the actual transfer of those funds to your organization's bank account. Deposit timing depends on your account's funding speed — check the Deposits page for the status of a specific transfer.</p>`,
  },
  {
    slug: "responding-to-a-dispute",
    title: "Responding to a Payment Dispute",
    category: "Payments & Deposits",
    bodyHtml: `<p>When a donor disputes a payment, it appears on the <strong>Disputes</strong> page along with a response deadline. Open the dispute and submit evidence (such as a receipt or donation confirmation) before the deadline. Missing the deadline typically results in an automatic loss of the dispute.</p>`,
  },
  {
    slug: "understanding-fees",
    title: "Understanding Processing Fees",
    category: "Payments & Deposits",
    bodyHtml: `<p>Your card and ACH processing rates are shown under <strong>Settings &gt; Fees</strong>. These rates are set as part of your account setup — contact Support if you have questions about your pricing.</p>`,
  },
  {
    slug: "customizing-donation-receipts",
    title: "Customizing Donation Receipts",
    category: "Receipts & Statements",
    bodyHtml: `<p>Under <strong>Settings &gt; Receipts</strong>, you can customize the sender name, subject line, header, thank-you message, and footer of automatic donation receipts, and choose which details (like fund or payment method) appear on them. Use the live preview to see your changes and send yourself a test receipt before saving.</p>`,
  },
  {
    slug: "sending-annual-statements",
    title: "Sending Annual Giving Statements",
    category: "Receipts & Statements",
    bodyHtml: `<p>From <strong>Donors &gt; Annual Statements</strong>, generate statements for a given tax year, preview them, and send them to donors by email. WGC does not provide tax advice — statements summarize giving activity only.</p>`,
  },
  {
    slug: "inviting-a-team-member",
    title: "Inviting a Team Member",
    category: "Account & Team",
    bodyHtml: `<p>Under <strong>Settings &gt; Team &amp; Access</strong>, enter a teammate's email and select <strong>Invite Organization Admin</strong>. They'll receive an email with a link to set their own password. You can resend or withdraw an invitation, or remove a teammate's access, from the same page.</p>`,
  },
  {
    slug: "changing-your-password",
    title: "Changing Your Password",
    category: "Account & Team",
    bodyHtml: `<p>Go to <strong>Settings &gt; Security</strong> and enter your current password along with a new one. If you're locked out, use <strong>Forgot Password</strong> on the sign-in page to reset it by email instead.</p>`,
  },
  {
    slug: "taking-a-payment-by-phone",
    title: "How do I take a payment by phone (Take a Payment)?",
    category: "Payments & Deposits",
    bodyHtml: `<p>Use <strong>Take a Payment</strong> to charge a card or bank account for someone who is paying you by phone or in person.</p><h3>How do I start?</h3><p>Select <strong>Take a Payment</strong> in the menu, or the button at the top of the <strong>Payments</strong> page. Enter the payer"s name and email and the amount, choose <strong>Card</strong> or <strong>Bank Account</strong>, enter the payment details, review the summary, and confirm.</p><h3>Who can take a payment?</h3><p>Anyone on your team except people with view-only access.</p><h3>Can the payer cover the processing fee?</h3><p>Yes. Turn on the option to add the processing fee on top of the amount. The review screen shows the total that will be charged to the card or bank account.</p><h3>Does the payer get a receipt?</h3><p>A receipt is emailed automatically when the payment succeeds. You can also print it or email it to a different address from the success screen. See <em>How do I print, view or email a receipt?</em></p><h3>Why did my payment fail?</h3><p>Check that the email address is valid, that any phone number is a valid 10-digit U.S. number (or leave it blank), and that the card or bank details are correct. If it still fails, try again or contact Support with the time and the amount.</p>`,
  },
  {
    slug: "printing-viewing-emailing-a-receipt",
    title: "How do I print, view or email a receipt?",
    category: "Receipts & Statements",
    bodyHtml: `<h3>How do I print a receipt right after taking a payment?</h3><p>On the success screen, select <strong>Print receipt</strong>. Your browser"s print dialog opens with the receipt ready to print.</p><h3>How do I print or view the receipt for an older payment?</h3><p>Open <strong>Payments</strong>, then either select the print icon in the <strong>Receipt</strong> column, or open the payment and use the <strong>Receipt</strong> section. Both let you print, email, or open the receipt PDF.</p><h3>What if the payer has no email address?</h3><p>You can still print or view the receipt. To email it, select <strong>Email receipt</strong> and type the address you want to send it to.</p><h3>What does "Open or download PDF" do?</h3><p>It opens the receipt PDF in a new tab, or downloads it, depending on your browser.</p><h3>The Print button saved a file instead of printing. Why?</h3><p>Some browsers, and apps that embed a browser, cannot show a PDF inside the page. Open the page in Chrome or Safari, or open the downloaded PDF and print it from there.</p><h3>Is viewing a receipt the same as sending it?</h3><p>No. Printing or viewing a receipt does not send anything and does not add a new entry to the payment"s receipt history. Emailing a receipt sends it and records a new version in the <strong>Receipt</strong> section of the payment.</p>`,
  },
  {
    slug: "receipt-processing-fee-line",
    title: "Why doesn't my receipt show the processing fee?",
    category: "Receipts & Statements",
    bodyHtml: `<h3>A payer covered the fee, so why does the receipt only show the amount?</h3><p>When a payer covers the processing fee, their card is charged the amount plus the fee. A receipt lists the fee only if <strong>Include Donor-Covered Fee</strong> is turned on under <strong>Settings &gt; Receipts</strong>.</p><h3>How do I turn it on?</h3><p>Go to <strong>Settings &gt; Receipts</strong>, switch on <strong>Include Donor-Covered Fee</strong>, and save.</p><h3>What will the receipt show?</h3><p>The amount, the <strong>Processing Fee Covered by Donor</strong>, and the <strong>Total Charged</strong>. For example, a $1,000 payment with a $30 fee shows $1,000, $30 and $1,030.</p><h3>Does it change receipts I already sent?</h3><p>No. Emails already sent keep their original text. Opening or printing the receipt again shows the fee line, and so do receipts sent from now on.</p><h3>Does payment mode change this?</h3><p>Yes. If your organization uses payment mode, the fee line always appears whenever a payer covered a fee, regardless of this setting, so the receipt adds up to the amount on the payer's card statement.</p>`,
  },
  {
    slug: "insights-charged-vs-received",
    title: "Why is Total Transaction Volume higher than what my organization receives?",
    category: "Insights & Reporting",
    bodyHtml: `<h3>What does Total Transaction Volume include?</h3><p>It is the total that was charged to payers. If a payer chose to cover the processing fee, that fee is included, so the total is higher than the payment itself. For example, a $1,000 payment with a $30 fee shows as $1,030.</p><h3>Where can I see the split?</h3><p>On the <strong>Payments</strong> tab of <strong>Insights</strong>, a row of three figures appears whenever fees were covered in the selected period: <strong>Total Charged</strong>, <strong>Processing Fees Covered</strong> and <strong>Amount to Organization</strong>. If your organization uses payment mode, the row always shows and reads <strong>Charged to Payers</strong>, <strong>Fees Covered by Payers</strong> and <strong>Amount to Organization</strong>. In the example, that is $1,030, $30 and $1,000.</p><h3>What if the payer did not cover the fee?</h3><p>Then the processing fee is taken out of your deposit instead, so what reaches your bank is lower than the amount charged.</p><h3>Does the Amount to Organization match my bank deposit?</h3><p>It shows what the payments are worth to your organization before any fees you pay yourself. Your deposit also reflects refunds, returns and any fees taken at settlement. Open the <strong>Deposits</strong> page for the exact figures.</p>`,
  },
  {
    slug: "payout-schedule-and-weekly-payouts",
    title: "When do I get paid, and can payouts be weekly?",
    category: "Payments & Deposits",
    bodyHtml: `<h3>How often are payouts made?</h3><p>Payouts go out each business day (Monday to Friday, except bank holidays). A payout scheduled for a weekend or holiday goes out the next business day.</p><h3>How long until a payment reaches my bank?</h3><p>Card payments usually arrive one to two business days after they are processed. Bank (ACH) payments are held longer, typically about five business days, to allow for returns.</p><h3>Can my payouts be weekly instead of daily?</h3><p>Payouts are set up daily by default. If you would like a different schedule, such as weekly, contact Support. A change has to be approved and set up by WGC and our payment processor, and we cannot promise a particular schedule.</p><h3>Where do I see my deposits?</h3><p>Open <strong>Deposits</strong> to see each transfer and its status, and <strong>Settlements</strong> to see the batches of payments each one covers.</p>`,
  },
  {
    slug: "deposit-included-payments",
    title: "How do I see the payments inside a deposit?",
    category: "Payments & Deposits",
    bodyHtml: `<h3>Where do I find the list of payments in a deposit?</h3><p>Open <strong>Deposits</strong> and select a deposit. The side panel shows <strong>Included Payments</strong>. Select <strong>View All Details</strong> for the full table.</p><h3>What does the list show?</h3><p>For each payment: the date, the payer, the note, and the gross, fee and net amounts, and its state. If your organization uses Student Giving it also shows the student ID and name, and if you use the term field it shows the term.</p><h3>Do the amounts add up to the deposit?</h3><p>Yes. The list ends with a <strong>Deposit total</strong>. If the payments do not add up to it exactly, an <strong>Other settlement-level adjustments</strong> line shows the difference, such as a per-settlement fee that is not tied to one payment.</p><h3>Can I download it?</h3><p>Yes. Select <strong>Download CSV</strong> on the deposit. The file has one row per payment and the same totals as the screen, so you can match it to your bank statement and post entries. Fees, refunds and returns appear as negative amounts.</p><h3>Why is my deposit empty or missing?</h3><p>A deposit appears only after the processor has settled your payments and sent the payout, so recent payments will not be in one yet.</p>`,
  },
  {
    slug: "searching-payments",
    title: "How do I search for a payment?",
    category: "Payments & Deposits",
    bodyHtml: `<h3>Where is the search?</h3><p>At the top of the <strong>Payments</strong> page.</p><h3>What can I search for?</h3><p>The payer"s name or email, a student ID or name, an amount (for example <em>1030</em> or <em>$1,030.00</em>), a word from the payment"s note, a term, or a transaction ID.</p><h3>How do I find a payment by amount, name or student ID?</h3><p>Type it into the search box at the top of <strong>Payments</strong> and press Enter. For an amount you can type <em>1030</em> or <em>$1,030.00</em>. To start over, select the x in the box.</p><h3>Can I combine search with filters?</h3><p>Yes. Search works together with the date range, state, source, fund and last-four filters.</p><h3>Does the export follow my search?</h3><p>Yes. <strong>Export CSV</strong> and <strong>Export PDF</strong> on the Payments page include only the payments that match your search and filters.</p>`,
  },
  {
    slug: "attaching-supporting-documents",
    title: "How do I attach supporting documents to a payment?",
    category: "Payments & Deposits",
    bodyHtml: `<h3>Where do I attach a document?</h3><p>Open a payment from <strong>Payments</strong> and find <strong>Supporting Documents</strong>. Select <strong>Attach document</strong> and choose a file.</p><h3>Which files can I attach?</h3><p>PDF, images (PNG, JPG, WebP, HEIC), Word, Excel, CSV or text files, up to 10 MB each and up to 25 per payment.</p><h3>Who can see the documents?</h3><p>Only your team. Files are stored privately and opened through a short-lived link that downloads the file. People with view-only access can see and download documents but cannot attach or remove them.</p><h3>How do I remove a document?</h3><p>Select the trash icon next to it. You can remove documents you attached yourself, and owners and admins who can see all transactions can remove any document. Removed files are no longer available to your team, and a record of what was attached and removed is kept for audit.</p>`,
  },
  {
    slug: "term-field-on-take-a-payment",
    title: "What is the Term field on Take a Payment?",
    category: "Payments & Deposits",
    bodyHtml: `<h3>What is it for?</h3><p>It lets staff tag a payment with a term, such as a prior semester, without creating a separate payment link for each term.</p><h3>What do I enter?</h3><p>Type the term, for example <em>Fall 2026</em>, or pick one you have used before. Leave it blank to use the current term for a student payment, or no term otherwise.</p><h3>Where does the term show up?</h3><p>On the payment in the <strong>Payments</strong> list and in a deposit"s <strong>Included Payments</strong> and CSV.</p><h3>Why don"t I see the Term field?</h3><p>It is turned on per organization. Contact Support to have it enabled.</p>`,
  },
  {
    slug: "note-on-receipts",
    title: "Can I show a note on the receipt?",
    category: "Receipts & Statements",
    bodyHtml: `<h3>Where do I type the note?</h3><p>In the <strong>Note</strong> box on Take a Payment.</p><h3>Where can the note appear?</h3><p>Your organization can choose: on the payer"s receipt, on the staff notification only, on both, or nowhere. For example, a note like "apply to previous semester" can print on the receipt.</p><h3>How do I change that setting?</h3><p>It is set per organization by WGC. Contact Support to change where notes appear.</p>`,
  },
  {
    slug: "what-is-payment-mode",
    title: "What is payment mode?",
    category: "Payment Mode & Branding",
    bodyHtml: `<h3>What does payment mode change?</h3><p>For organizations that use WGC as a general card processor rather than for donations, it replaces donor, donation and giving wording with payer and payment wording. That covers the dashboard menu and pages, payment links and the public payment page, receipts and receipt emails, and the payer portal.</p><h3>Why does my dashboard say Payers and Payments instead of Donors and Donations?</h3><p>Your organization uses payment mode, which swaps donor and donation wording for payer and payment wording. It only changes the words you and your payers see; it does not change how anything works.</p><h3>Does anything else change?</h3><p>Only wording and receipt defaults. Payments, deposits, funds and reports work the same way. Receipts also drop the donation-style tax acknowledgment sentence and always itemize a fee the payer covered. Text you saved yourself in <strong>Settings &gt; Receipts</strong> is never replaced.</p><h3>How do I turn it on or off?</h3><p>Payment mode is switched on per organization by WGC staff, in the admin area under the organization"s <strong>Payment processor mode</strong> panel. Contact Support to change it.</p><h3>Why do some words still say donation or giving?</h3><p>Features for donations, such as Student Giving and External Donations, keep their names.</p>`,
  },
  {
    slug: "branded-dashboard",
    title: "Why do I see my logo and colors on my dashboard?",
    category: "Payment Mode & Branding",
    bodyHtml: `<h3>How does my dashboard get my logo and colors?</h3><p>WGC staff can turn on <strong>Branded dashboard</strong> for your organization. It then uses the logo and colors saved under <strong>Settings &gt; Branding</strong>.</p><h3>How do I change them?</h3><p>Update your logo and colors under <strong>Settings &gt; Branding</strong>. Use a 6-digit color such as #1F3A5F and a logo with a secure (https) address.</p><h3>Does it affect my payers?</h3><p>Payment links and receipts already use your branding from the same settings. The branded dashboard only changes how your own team sees the dashboard.</p>`,
  },
];

export function getArticlesByCategory(): Record<string, HelpArticle[]> {
  const grouped: Record<string, HelpArticle[]> = {};
  for (const category of HELP_CATEGORIES) grouped[category] = [];
  for (const article of HELP_ARTICLES) {
    if (!grouped[article.category]) grouped[article.category] = [];
    grouped[article.category].push(article);
  }
  return grouped;
}
