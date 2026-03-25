<script setup>
import { onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const me = ref(null);
const records = ref([]);
const form = reactive({ foodName: "", calories: 300, mealType: "lunch", date: "", note: "" });

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  records.value = await api.get(`/diets/${me.value.id}`).then((r) => r.data);
}

async function addRecord() {
  await api.post("/diets", { ...form, userId: me.value.id });
  form.foodName = "";
  form.calories = 300;
  form.mealType = "lunch";
  form.date = "";
  form.note = "";
  await load();
}

async function removeRecord(id) {
  await api.delete(`/diets/${id}`);
  await load();
}

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">🥗 Diet</h2>

    <section class="panel">
      <h3>Add Meal Record</h3>
      <form novalidate @submit.prevent="addRecord">
        <input v-model="form.foodName" placeholder="Food name" />
        <div class="grid grid-2">
          <input v-model.number="form.calories" type="number" min="0" placeholder="Calories" />
          <select v-model="form.mealType">
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </div>
        <input v-model="form.date" type="date" />
        <input v-model="form.note" placeholder="Note (optional)" />
        <button type="submit">Save Meal</button>
      </form>
    </section>

    <section class="list">
      <article v-for="d in records" :key="d._id" class="card">
        <h3>{{ d.foodName }}</h3>
        <p>Meal Type: {{ d.mealType }}</p>
        <p>Calories: {{ d.calories }}</p>
        <p>Date: {{ new Date(d.date).toLocaleDateString() }}</p>
        <p class="muted">{{ d.note || "No note" }}</p>
        <button @click="removeRecord(d._id)">Delete</button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.list { margin-top: 16px; display: grid; gap: 12px; }
</style>

