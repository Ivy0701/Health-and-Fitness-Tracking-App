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
    <section class="panel feedback">
      <h2 class="title">💬 Feedback</h2>
      <form @submit.prevent="submit">
        <input v-model.number="form.rating" type="number" min="1" max="5" placeholder="Rating (1-5)" />
        <textarea v-model="form.content" placeholder="Your feedback" />
        <input v-model="form.contact_email" placeholder="Contact email (optional)" />
        <button type="submit">📨 Submit Feedback</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.feedback { max-width: 620px; }
</style>
