<script setup>
import { onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const me = ref(null);
const items = ref([]);
const form = reactive({ title: "", date: "", time: "", note: "" });

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  items.value = await api.get(`/schedules/${me.value.id}`).then((r) => r.data);
}

async function addItem() {
  await api.post("/schedules", { ...form, userId: me.value.id });
  form.title = "";
  form.date = "";
  form.time = "";
  form.note = "";
  await load();
}

async function removeItem(id) {
  await api.delete(`/schedules/${id}`);
  await load();
}

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">🗓 Schedule</h2>

    <section class="panel">
      <h3>Add Schedule Item</h3>
      <form novalidate @submit.prevent="addItem">
        <input v-model="form.title" placeholder="Title" />
        <div class="grid grid-2">
          <input v-model="form.date" type="date" />
          <input v-model="form.time" type="time" />
        </div>
        <input v-model="form.note" placeholder="Note (optional)" />
        <button type="submit">Save Schedule</button>
      </form>
    </section>

    <section class="list">
      <article v-for="s in items" :key="s._id" class="card">
        <h3>{{ s.title }}</h3>
        <p>Date: {{ s.date }}</p>
        <p>Time: {{ s.time }}</p>
        <p class="muted">{{ s.note || "No note" }}</p>
        <button @click="removeItem(s._id)">Delete</button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.list { margin-top: 16px; display: grid; gap: 12px; }
</style>

