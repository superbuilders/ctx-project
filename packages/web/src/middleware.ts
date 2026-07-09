export { auth as middleware } from "@/lib/auth";

export const config = {
  // Protect all routes except static assets, health endpoint, and auth routes
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/auth|auth).*)",
  ],
};
