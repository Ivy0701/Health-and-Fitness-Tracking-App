<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: "", email: "", password: "", confirmPassword: "" });
const state = reactive({ error: "" });

async function submit() {
  state.error = "";
  if (form.password.length < 8) {
    state.error = "Password must be at least 8 characters.";
    return;
  }
  if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
    state.error = "Password should include letters and numbers.";
    return;
  }
  if (form.password !== form.confirmPassword) {
    state.error = "Passwords do not match.";
    return;
  }
  try {
    await auth.register({
      username: form.username,
      email: form.email,
      password: form.password
    });
    router.push("/dashboard");
  } catch (error) {
    state.error = error?.response?.data?.message || "Register failed";
  }
}
</script>

<template>
  <main class="page">
    <section class="panel auth">
      <h2 class="title">📝 Register</h2>
      <form novalidate @submit.prevent="submit">
        <div class="field">
          <input v-model="form.username" placeholder="Username" />
          <p class="helper">Username should be easy to identify.</p>
        </div>

        <div class="field">
          <input v-model="form.email" type="email" placeholder="Email" />
          <p class="helper">Please enter a valid email address.</p>
        </div>

        <div class="field">
          <input v-model="form.password" type="password" placeholder="Password" />
          <p class="helper">Password must be at least 8 characters and should include letters and numbers.</p>
        </div>

        <div class="field">
          <input v-model="form.confirmPassword" type="password" placeholder="Confirm Password" />
          <p class="helper">Please re-enter the same password.</p>
        </div>

        <button type="submit">Create Account ✨</button>
      </form>
      <p v-if="state.error" class="error">❌ {{ state.error }}</p>
      <p class="muted">After registration, you will be redirected to your dashboard.</p>
      <p class="muted">
        Already have an account?
        <router-link to="/login" class="signin-link">Sign in here.</router-link>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth { max-width: 440px; margin: 30px auto; }
.error { color: #b42318; background: #fdecec; border: 1px solid #f5c2c0; border-radius: 8px; padding: 8px; }
.field { display: grid; gap: 4px; }
.helper { margin: 0; font-size: 12px; color: #6b7280; }
.signin-link { color: var(--c5); font-weight: 600; text-decoration: none; }
.signin-link:hover { text-decoration: underline; }
</style>
