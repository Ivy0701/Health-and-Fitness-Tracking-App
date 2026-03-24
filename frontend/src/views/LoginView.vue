<script setup>
import { reactive } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ email: "", password: "" });

async function submit() {
  await auth.login(form);
  router.push("/assessment");
}
</script>

<template>
  <main class="page">
    <section class="panel auth">
      <h2 class="title">🔐 Login</h2>
      <form @submit.prevent="submit">
        <input v-model="form.email" placeholder="Email" required />
        <input v-model="form.password" type="password" placeholder="Password" required />
        <button type="submit">进入系统 🚀</button>
      </form>
      <p class="muted">没有账号？去注册页面创建一个新账号。</p>
    </section>
  </main>
</template>

<style scoped>
.auth { max-width: 440px; margin: 30px auto; }
</style>
