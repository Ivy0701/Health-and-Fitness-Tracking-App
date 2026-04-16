<script setup>
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { listAdminTestAccounts, signInAdmin } from "../services/adminAuth";

const route = useRoute();
const router = useRouter();

const form = reactive({
  identifier: "",
  password: "",
});
const showPassword = ref(false);
const submitting = ref(false);
const error = ref("");

const testAccounts = computed(() => listAdminTestAccounts());

function autofill(account) {
  form.identifier = account?.email || account?.username || "";
  form.password = account?.password || "";
  error.value = "";
}

async function submitLogin() {
  if (submitting.value) return;
  const identifier = String(form.identifier || "").trim();
  const password = String(form.password || "");
  if (!identifier || !password) {
    error.value = "Please enter both account and password.";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    const result = signInAdmin({ identifier, password });
    if (!result.ok) {
      error.value = result.message || "Sign in failed.";
      return;
    }
    const redirect = String(route.query.redirect || "").trim();
    const target = redirect && redirect !== "/login" ? redirect : "/";
    await router.replace(target);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="login-wrap">
    <section class="login-card">
      <h1>System Status Admin Login</h1>
      <p class="sub">Internal Admin Access</p>

      <form class="login-form" @submit.prevent="submitLogin">
        <label>
          Email or Username
          <input
            v-model="form.identifier"
            type="text"
            autocomplete="username"
            placeholder="admin@healthfit.local"
          />
        </label>

        <label>
          Password
          <div class="password-row">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="Enter password"
            />
            <button type="button" class="toggle-btn" @click="showPassword = !showPassword">
              {{ showPassword ? "Hide" : "Show" }}
            </button>
          </div>
        </label>

        <button class="sign-btn" type="submit" :disabled="submitting">
          {{ submitting ? "Signing in..." : "Sign In" }}
        </button>
      </form>

      <p v-if="error" class="error-msg">{{ error }}</p>

      <div class="test-accounts">
        <h2>Admin Test Accounts</h2>
        <p class="hint">Use a test admin account to sign in. Click to autofill.</p>
        <button
          v-for="account in testAccounts"
          :key="account.id"
          type="button"
          class="test-account-btn"
          @click="autofill(account)"
        >
          <span>{{ account.email }}</span>
          <code>{{ account.password }}</code>
        </button>
      </div>

      <p class="foot-note">Internal use only</p>
    </section>
  </main>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background: linear-gradient(165deg, #e8f5ef 0%, #f0faf7 35%, #ffffff 70%);
}

.login-card {
  width: min(460px, 100%);
  background: #fff;
  border: 1px solid rgba(64, 145, 108, 0.25);
  border-radius: 16px;
  box-shadow: 0 8px 28px rgba(15, 36, 41, 0.1);
  padding: 22px 18px;
}

.login-card h1 {
  margin: 0;
  color: #1b4332;
  font-size: 1.35rem;
}

.sub {
  margin: 8px 0 16px;
  color: #52796f;
  font-size: 0.92rem;
}

.login-form {
  display: grid;
  gap: 12px;
}

label {
  display: grid;
  gap: 6px;
  color: #355f52;
  font-size: 0.9rem;
}

input {
  width: 100%;
  border: 1px solid #ccebd5;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.92rem;
  outline: none;
}

input:focus {
  border-color: #5ab99f;
  box-shadow: 0 0 0 3px rgba(90, 185, 159, 0.2);
}

.password-row {
  display: flex;
  gap: 8px;
}

.toggle-btn {
  border: 1px solid #ccebd5;
  border-radius: 10px;
  padding: 8px 12px;
  background: #f4fbf7;
  color: #2f5d50;
  cursor: pointer;
}

.sign-btn {
  margin-top: 4px;
  border: none;
  border-radius: 10px;
  padding: 11px 12px;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(90deg, #2d6a4f 0%, #40916c 100%);
}

.sign-btn:disabled {
  opacity: 0.68;
  cursor: not-allowed;
}

.error-msg {
  margin: 12px 0 0;
  color: #9b1c1c;
  font-size: 0.85rem;
}

.test-accounts {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e6f2ea;
}

.test-accounts h2 {
  margin: 0;
  color: #1b4332;
  font-size: 1rem;
}

.hint {
  margin: 6px 0 10px;
  color: #52796f;
  font-size: 0.8rem;
}

.test-account-btn {
  width: 100%;
  border: 1px solid #d9ece3;
  border-radius: 10px;
  background: #f8fcf9;
  color: #294f44;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  margin-top: 8px;
  cursor: pointer;
}

.test-account-btn code {
  font-size: 0.8rem;
  color: #1f4f45;
}

.foot-note {
  margin: 14px 0 0;
  text-align: center;
  color: #6a8e82;
  font-size: 0.78rem;
}
</style>

