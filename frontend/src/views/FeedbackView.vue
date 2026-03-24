<script setup>
import { reactive } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const form = reactive({ rating: 5, content: "", contact_email: "" });
async function submit() {
  await api.post("/feedback", form);
  alert("Submitted");
}
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2>Feedback</h2>
    <form @submit.prevent="submit">
      <input v-model.number="form.rating" type="number" min="1" max="5" />
      <textarea v-model="form.content" placeholder="Your feedback" />
      <input v-model="form.contact_email" placeholder="Contact email (optional)" />
      <button type="submit">Submit</button>
    </form>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
form { display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
</style>
