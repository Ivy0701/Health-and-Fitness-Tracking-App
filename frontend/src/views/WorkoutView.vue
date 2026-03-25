<script setup>
import { onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const me = ref(null);
const records = ref([]);
const form = reactive({ type: "", duration: 30, caloriesBurned: 200, date: "", note: "" });

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  records.value = await api.get(`/workouts/${me.value.id}`).then((r) => r.data);
}

async function addRecord() {
  await api.post("/workouts", { ...form, userId: me.value.id });
  form.type = "";
  form.duration = 30;
  form.caloriesBurned = 200;
  form.date = "";
  form.note = "";
  await load();
}

async function removeRecord(id) {
  await api.delete(`/workouts/${id}`);
  await load();
}

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">💪 Workout</h2>

    <section class="panel">
      <h3>Add Workout Record</h3>
      <form novalidate @submit.prevent="addRecord">
        <input v-model="form.type" placeholder="Workout type (e.g. Running)" />
        <div class="grid grid-2">
          <input v-model.number="form.duration" type="number" min="1" placeholder="Duration (minutes)" />
          <input v-model.number="form.caloriesBurned" type="number" min="0" placeholder="Calories burned" />
        </div>
        <input v-model="form.date" type="date" />
        <input v-model="form.note" placeholder="Note (optional)" />
        <button type="submit">Save Workout</button>
      </form>
    </section>

    <section class="list">
      <article v-for="w in records" :key="w._id" class="card">
        <h3>{{ w.type }}</h3>
        <p>Duration: {{ w.duration }} min</p>
        <p>Calories Burned: {{ w.caloriesBurned }}</p>
        <p>Date: {{ new Date(w.date).toLocaleDateString() }}</p>
        <p class="muted">{{ w.note || "No note" }}</p>
        <button @click="removeRecord(w._id)">Delete</button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.list { margin-top: 16px; display: grid; gap: 12px; }
</style>

