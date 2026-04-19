<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { getClientCaptchaValidation } from "@shared/clientCaptcha.js";
import { useClientCaptcha } from "@shared/useClientCaptcha.js";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ email: "", password: "", verificationCode: "" });
const state = reactive({ error: "" });
const errors = reactive({ email: "", password: "", verificationCode: "" });
const { captchaCode, regenerate: generateCaptcha } = useClientCaptcha();

const testAccounts = [
  { name: "Test User 1", email: "test1@example.com", password: "Test1234" },
  { name: "Test User 2", email: "test2@example.com", password: "Test5678" }
];

function fillTestAccount(account) {
  form.email = account.email;
  form.password = account.password;
}

function clearErrors() {
  errors.email = "";
  errors.password = "";
  errors.verificationCode = "";
}

function validateForm() {
  clearErrors();
  let ok = true;
  const email = String(form.email || "").trim();
  const password = String(form.password || "");
  const captchaCheck = getClientCaptchaValidation(form.verificationCode, captchaCode.value);

  if (!email) {
    errors.email = "Email is required.";
    ok = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Please enter a valid email address.";
    ok = false;
  }

  if (!password) {
    errors.password = "Password is required.";
    ok = false;
  } else if (password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
    ok = false;
  }

  if (!captchaCheck.ok) {
    errors.verificationCode = captchaCheck.message;
    ok = false;
  }

  if (captchaCheck.shouldRegenerate) {
    generateCaptcha();
  }
  return ok;
}

async function submit() {
  state.error = "";
  if (!validateForm()) return;
  try {
    await auth.login({ email: form.email, password: form.password });
    router.push(auth.user?.assessment_completed ? "/dashboard" : "/assessment");
  } catch (error) {
    state.error = error?.response?.data?.message || "Login failed";
    generateCaptcha();
  }
}
</script>

<template>
  <main class="page auth-page">
    <section class="panel auth">
      <h2 class="title">🔐 Login</h2>
      <form novalidate @submit.prevent="submit">
        <div class="field">
          <input v-model="form.email" type="email" placeholder="Email" />
          <p class="helper">Please enter your registered email address.</p>
          <p v-if="errors.email" class="field-error">{{ errors.email }}</p>
        </div>

        <div class="field">
          <input v-model="form.password" type="password" placeholder="Password" />
          <div class="password-hint-row">
            <p class="helper password-hint">Password must be at least 8 characters.</p>
            <router-link to="/reset-password" class="forgot-link">Forgot password?</router-link>
          </div>
          <p v-if="errors.password" class="field-error">{{ errors.password }}</p>
        </div>

        <div class="field">
          <label class="field-label" for="verificationCode">Verification Code</label>
          <div class="captcha-row">
            <input
              id="verificationCode"
              v-model="form.verificationCode"
              type="text"
              placeholder="Enter code"
              maxlength="4"
            />
            <button type="button" class="captcha-box" @click="generateCaptcha" title="Refresh code">
              {{ captchaCode }}
            </button>
          </div>
          <p class="helper">Click the code box to refresh.</p>
          <p v-if="errors.verificationCode" class="field-error">{{ errors.verificationCode }}</p>
        </div>

        <button type="submit">Sign In 🚀</button>
      </form>
      <p v-if="state.error" class="error">❌ {{ state.error }}</p>

      <section class="test-accounts">
        <h3>Test Accounts</h3>
        <p class="helper">Click to auto-fill test account credentials.</p>
        <button
          v-for="account in testAccounts"
          :key="account.email"
          type="button"
          class="test-account-btn"
          @click="fillTestAccount(account)"
        >
          <strong>{{ account.name }}</strong>
          <span>{{ account.email }} / {{ account.password }}</span>
        </button>
      </section>

      <p class="muted">
        Don't have an account?
        <router-link to="/register" class="signup-link">Sign up here.</router-link>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: calc(100vh - 48px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth {
  width: 100%;
  max-width: 460px;
  margin: 0 auto;
  padding: 22px;
}

.error { color: #b42318; background: #fdecec; border: 1px solid #f5c2c0; border-radius: 8px; padding: 8px; }
.field { display: grid; gap: 4px; }
.helper { margin: 0; font-size: 12px; color: #6b7280; }
.field-error { margin: 0; font-size: 12px; color: #c0392b; }
.field-label { font-size: 13px; font-weight: 600; color: var(--c5); }
.signup-link { color: var(--c5); font-weight: 600; text-decoration: none; }
.signup-link:hover { text-decoration: underline; }

.password-hint-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.password-hint {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.forgot-link {
  font-size: 12px;
  color: var(--c5);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.forgot-link:hover {
  text-decoration: underline;
}

.captcha-row {
  display: grid;
  grid-template-columns: 1fr 112px;
  gap: 10px;
  align-items: center;
}

.captcha-box {
  border: 1px solid #c8dbd7;
  border-radius: 10px;
  background: #f4f8f7;
  color: #2f4858;
  height: 42px;
  font-weight: 700;
  letter-spacing: 2px;
  cursor: pointer;
}

.test-accounts {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #d7e7e6;
  border-radius: 12px;
  background: #f8fcfb;
  display: grid;
  gap: 8px;
}

.test-accounts h3 {
  margin: 0;
  font-size: 15px;
  color: #2f4858;
}

.test-account-btn {
  text-align: left;
  border: 1px solid #cfe1dd;
  background: #fff;
  color: #2f4858;
  border-radius: 10px;
  padding: 9px 10px;
  display: grid;
  gap: 3px;
}

.test-account-btn span {
  font-size: 12px;
  color: #5b6f7d;
}

.test-account-btn:hover {
  background: #eef7f5;
}
</style>
