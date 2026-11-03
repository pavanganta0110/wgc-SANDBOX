import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { redactQuery, searchHelp } from "@/lib/support/helpSearch";
import { checkHelpSearchRateLimit } from "@/lib/support/helpSearchRateLimit";

const MAX_QUERY_LENGTH = 300;
const MAX_ANSWER_LENGTH = 700;

/** Cuts a long answer at a sentence end where possible, so it reads cleanly with a "read the full article" link. */
function clipAnswer(answer: string): { text: string; truncated: boolean } {
  if (answer.length <= MAX_ANSWER_LENGTH) return { text: answer, truncated: false };
  const cut = answer.slice(0, MAX_ANSWER_LENGTH);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "));
  return { text: (lastStop > 300 ? cut.slice(0, lastStop + 1) : cut.trimEnd()) + (lastStop > 300 ? "" : "…"), truncated: true };
}

/**
 * Help Center "Ask a question": finds the best matching questions and answers in our own articles. No AI and no
 * outside service. Signed-in users only.
 */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const raw = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (raw.length < 2) return NextResponse.json({ error: "Type a question to search." }, { status: 400 });

  if (!checkHelpSearchRateLimit(auth.userId)) {
    return NextResponse.json({ error: "You're searching quickly. Please wait a moment and try again." }, { status: 429 });
  }

  const results = searchHelp(raw, { limit: 3 });

  // Keep a masked copy of what was asked so unanswered questions can be turned into new articles. Never allowed to
  // break the search itself.
  try {
    await prisma.helpSearchLog.create({
      data: {
        churchId: auth.churchId,
        userId: auth.impersonation ? null : auth.userId,
        query: redactQuery(raw),
        matched: results.length > 0,
        topSlug: results[0]?.slug ?? null,
        topScore: results[0]?.score ?? null,
      },
    });
  } catch (err) {
    console.error("Help search log failed:", err);
  }

  return NextResponse.json({
    matched: results.length > 0,
    results: results.map((r) => {
      const { text, truncated } = clipAnswer(r.answer);
      return { slug: r.slug, title: r.articleTitle, category: r.category, question: r.question, answer: text, truncated };
    }),
  });
}
