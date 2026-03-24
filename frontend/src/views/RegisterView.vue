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
    <h2>Register</h2>
    <form @submit.prevent="submit">
      <input v-model="form.username" placeholder="Username" required />
      <input v-model="form.email" placeholder="Email" required />
      <input v-model="form.password" type="password" placeholder="Password" required />
      <button type="submit">Register</button>
    </form>
  </main>
</template>

<style scoped>
.page { padding: 24px; max-width: 420px; margin: 0 auto; }
form { display: flex; flex-direction: column; gap: 10px; }
</style>
