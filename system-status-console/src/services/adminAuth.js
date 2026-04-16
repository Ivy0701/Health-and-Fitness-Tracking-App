import { ADMIN_TEST_ACCOUNTS } from "../auth/adminAccounts";

export const ADMIN_SESSION_KEY = "admin_session";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function storage() {
  return window.sessionStorage;
}

export function listAdminTestAccounts() {
  return ADMIN_TEST_ACCOUNTS.map((item) => ({
    id: item.id,
    email: item.email,
    username: item.username,
    password: item.password,
    displayName: item.displayName,
  }));
}

export function getAdminSession() {
  const raw = storage().getItem(ADMIN_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isAdminAuthenticated() {
  return Boolean(getAdminSession());
}

export function clearAdminSession() {
  storage().removeItem(ADMIN_SESSION_KEY);
}

export function signInAdmin({ identifier, password }) {
  const idValue = normalize(identifier);
  const pwdValue = String(password || "");
  if (!idValue || !pwdValue) {
    return { ok: false, message: "Please fill in both account and password." };
  }
  const account = ADMIN_TEST_ACCOUNTS.find(
    (item) => normalize(item.email) === idValue || normalize(item.username) === idValue
  );
  if (!account) {
    return { ok: false, message: "Admin account not found." };
  }
  if (String(account.password) !== pwdValue) {
    return { ok: false, message: "Incorrect password." };
  }
  const session = {
    id: account.id,
    email: account.email,
    username: account.username,
    displayName: account.displayName || account.username || account.email,
    signedInAt: new Date().toISOString(),
  };
  storage().setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

