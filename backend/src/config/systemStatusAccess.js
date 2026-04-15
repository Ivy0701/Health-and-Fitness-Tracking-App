/**
 * When true, GET /api/dashboard/system-status does not require JWT.
 * - SYSTEM_STATUS_PUBLIC=true  → always public
 * - SYSTEM_STATUS_PUBLIC=false → always requires auth
 * - unset → public only when NODE_ENV is not "production" (local dev default)
 */
function isSystemStatusPublic() {
  const explicit = String(process.env.SYSTEM_STATUS_PUBLIC || "").toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return process.env.NODE_ENV !== "production";
}

module.exports = { isSystemStatusPublic };
