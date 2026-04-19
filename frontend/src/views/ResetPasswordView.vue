<script setup>
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import api from "../services/api";

const router = useRouter();

const form = reactive({
  email: "",
  verificationInput: "",
  newPassword: "",
  confirmPassword: "",
});

const displayCode = ref("");
const emailIssuedFor = ref("");
const issueNotFound = ref(false);
const issuing = ref(false);
const resetting = ref(false);

const banner = reactive({ kind: "", text: "" });
const fieldError = reactive({
  email: "",
  verification: "",
  newPassword: "",
  confirmPassword: "",
});

const normalizedEmail = computed(() => String(form.email || "").trim().toLowerCase());

const codeReady = computed(
  () => Boolean(displayCode.value && emailIssuedFor.value && emailIssuedFor.value === normalizedEmail.value)
);

function clearFieldErrors() {
  fieldError.email = "";
  fieldError.verification = "";
  fieldError.newPassword = "";
  fieldError.confirmPassword = "";
}

function clearBanner() {
  banner.kind = "";
  banner.text = "";
}

function validEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function onEmailInput() {
  issueNotFound.value = false;
  fieldError.email = "";
  if (emailIssuedFor.value && normalizedEmail.value !== emailIssuedFor.value) {
    displayCode.value = "";
    emailIssuedFor.value = "";
    form.verificationInput = "";
  }
}

async function issueVerification() {
  clearBanner();
  clearFieldErrors();
  const email = normalizedEmail.value;
  if (!email) {
    fieldError.email = "Please enter your email.";
    displayCode.value = "";
    emailIssuedFor.value = "";
    return;
  }
  if (!validEmailFormat(email)) {
    fieldError.email = "Please enter your email.";
    displayCode.value = "";
    emailIssuedFor.value = "";
    return;
  }

  issuing.value = true;
  try {
    const { data } = await api.post("/auth/issue-reset-verification", { email });
    const code = String(data?.verificationCode || "").trim();
    if (!code) {
      displayCode.value = "";
      emailIssuedFor.value = "";
      return;
    }
    issueNotFound.value = false;
    displayCode.value = code;
    emailIssuedFor.value = email;
    form.verificationInput = "";
  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.message || "";
    displayCode.value = "";
    emailIssuedFor.value = "";
    if (status === 404) {
      issueNotFound.value = true;
      fieldError.email = msg || "No account found with this email address.";
    } else {
      banner.kind = "err";
      banner.text = msg || "Something went wrong.";
    }
  } finally {
    issuing.value = false;
  }
}

function onEmailBlur() {
  issueVerification();
}

function refreshCode() {
  if (!codeReady.value && !normalizedEmail.value) return;
  issueVerification();
}

function validateClient() {
  if (issueNotFound.value) return false;
  clearFieldErrors();
  let ok = true;
  const email = normalizedEmail.value;

  if (!email) {
    fieldError.email = "Please enter your email.";
    ok = false;
  } else if (!validEmailFormat(email)) {
    fieldError.email = "Please enter your email.";
    ok = false;
  }

  if (!ok) return false;

  if (!codeReady.value) {
    fieldError.verification = "Invalid verification code.";
    ok = false;
  }

  const entered = String(form.verificationInput || "").trim();
  if (!entered) {
    fieldError.verification = "Invalid verification code.";
    ok = false;
  }

  const p1 = String(form.newPassword || "");
  const p2 = String(form.confirmPassword || "");

  if (!p1) {
    fieldError.newPassword = "Password must be at least 8 characters.";
    ok = false;
  } else if (p1.length < 8) {
    fieldError.newPassword = "Password must be at least 8 characters.";
    ok = false;
  }

  if (p1 !== p2) {
    fieldError.confirmPassword = "Passwords do not match.";
    ok = false;
  }

  return ok;
}

async function submitReset() {
  clearBanner();
  const email = normalizedEmail.value;
  if (email && validEmailFormat(email) && !codeReady.value) {
    await issueVerification();
  }
  if (issueNotFound.value) return;
  if (!validateClient()) return;

  resetting.value = true;
  try {
    const { data } = await api.post("/auth/reset-password", {
      email: normalizedEmail.value,
      verificationCode: String(form.verificationInput || "").trim(),
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    });
    displayCode.value = "";
    emailIssuedFor.value = "";
    form.verificationInput = "";
    form.newPassword = "";
    form.confirmPassword = "";
    banner.kind = "ok";
    banner.text = data?.message || "Password reset successfully. Please sign in with your new password.";
    setTimeout(() => {
      router.push("/login");
    }, 1600);
  } catch (err) {
    const msg = err?.response?.data?.message || "Something went wrong.";
    banner.kind = "err";
    banner.text = msg;
  } finally {
    resetting.value = false;
  }
}

function goLogin() {
  router.push("/login");
}
</script>

<template>
  <main class="page auth-page">
    <section class="panel auth">
      <h2 class="title">Reset Password</h2>

      <p v-if="banner.text" class="banner" :class="banner.kind === 'ok' ? 'banner-ok' : 'banner-err'">
        {{ banner.text }}
      </p>

      <form novalidate @submit.prevent="submitReset">
        <div class="field">
          <input
            v-model="form.email"
            type="email"
            placeholder="Email"
            autocomplete="email"
            @input="onEmailInput"
            @blur="onEmailBlur"
          />
          <p v-if="fieldError.email" class="field-error">{{ fieldError.email }}</p>
        </div>

        <div v-if="codeReady" class="field verification-block">
          <label class="field-label" for="resetVerificationInput">Verification Code</label>
          <div class="captcha-row">
            <input
              id="resetVerificationInput"
              v-model="form.verificationInput"
              type="text"
              placeholder="Enter verification code"
              maxlength="8"
              autocomplete="one-time-code"
            />
            <button
              type="button"
              class="captcha-box"
              :disabled="issuing"
              title="Refresh code"
              @click="refreshCode"
            >
              {{ displayCode }}
            </button>
          </div>
          <p class="helper">Enter the verification code shown above.</p>
          <p v-if="fieldError.verification" class="field-error">{{ fieldError.verification }}</p>
        </div>

        <div class="field">
          <input v-model="form.newPassword" type="password" placeholder="New password" autocomplete="new-password" />
          <p class="helper">At least 8 characters.</p>
          <p v-if="fieldError.newPassword" class="field-error">{{ fieldError.newPassword }}</p>
        </div>

        <div class="field">
          <input
            v-model="form.confirmPassword"
            type="password"
            placeholder="Confirm new password"
            autocomplete="new-password"
          />
          <p v-if="fieldError.confirmPassword" class="field-error">{{ fieldError.confirmPassword }}</p>
        </div>

        <button type="submit" class="btn-primary" :disabled="resetting || issuing">
          {{ resetting ? "Resetting…" : "Reset Password" }}
        </button>
      </form>

      <p class="muted footer-links">
        <button type="button" class="link-btn" @click="goLogin">Back to Sign In</button>
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

.title {
  margin-top: 0;
}

.field {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c5, #2a9d8f);
}

.helper {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.field-error {
  margin: 0;
  font-size: 12px;
  color: #c0392b;
}

input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #c8dbd7;
  border-radius: 10px;
  font-size: 15px;
  box-sizing: border-box;
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
  letter-spacing: 3px;
  font-size: 15px;
  cursor: pointer;
}

.captcha-box:disabled {
  opacity: 0.65;
  cursor: wait;
}

.btn-primary {
  width: 100%;
  margin-top: 8px;
  padding: 12px 16px;
  border: none;
  border-radius: 10px;
  background: #2a9d8f;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.banner {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 14px;
}

.banner-ok {
  background: #e8f7f4;
  border: 1px solid #9dd4cb;
  color: #1d6f63;
}

.banner-err {
  background: #fdecec;
  border: 1px solid #f5c2c0;
  color: #b42318;
}

.muted {
  margin-top: 16px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
}

.link-btn {
  background: none;
  border: none;
  color: var(--c5, #2a9d8f);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: 14px;
}

.footer-links {
  margin-top: 18px;
}
</style>
