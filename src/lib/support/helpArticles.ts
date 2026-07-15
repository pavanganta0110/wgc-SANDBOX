export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  bodyHtml: string;
}

export const HELP_CATEGORIES = ["Giving Links", "Donors & Recurring Giving", "Payments & Deposits", "Receipts & Statements", "Account & Team"];

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
