/**
 * Split out from session.ts so middleware.ts (which runs on the Edge
 * runtime) can read the cookie name without pulling in session.ts's prisma
 * import — Prisma's default client isn't Edge-runtime-safe, and middleware
 * only needs the name for a coarse presence check anyway.
 */
export const SESSION_COOKIE_NAME = "wgc_session";
