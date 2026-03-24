<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: "", email: "", password: "" });
const state = reactive({ error: "" });

async function submit() {
  state.error = "";
  try {
    await auth.register(form);
    router.push("/assessment");
  } catch (error) {
    state.error = error?.response?.data?.message || "Register failed";
  }
}
</script>

<template>
  <main class="page">
    <section class="panel auth">
      <h2 class="title">📝 Register</h2>
      <form @submit.prevent="submit">
        <input v-model="form.username" placeholder="Username" required />
        <input v-model="form.email" placeholder="Email" required />
        <input v-model="form.password" type="password" placeholder="Password" required />
        <button type="submit">创建账号 ✨</button>
      </form>
      <p v-if="state.error" class="error">❌ {{ state.error }}</p>
      <p class="muted">注册后会直接进入健康评估页。</p>
    </section>
  </main>
</template>

<style scoped>
.auth { max-width: 440px; margin: 30px auto; }
.error { color: #b42318; background: #fdecec; border: 1px solid #f5c2c0; border-radius: 8px; padding: 8px; }
</style>
