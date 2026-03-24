<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: "", email: "", password: "" });

async function submit() {
  await auth.register(form);
  router.push("/assessment");
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
      <p class="muted">注册后会直接进入健康评估页。</p>
    </section>
  </main>
</template>

<style scoped>
.auth { max-width: 440px; margin: 30px auto; }
</style>
