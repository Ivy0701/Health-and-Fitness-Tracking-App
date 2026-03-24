<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const plans = ref([]);
onMounted(async () => {
  const { data } = await api.get("/vip/plans");
  plans.value = data;
});

async function upgrade(plan) {
  await api.post("/vip/upgrade", { plan_name: plan });
  alert(`Upgraded to ${plan} (mock)`);
}
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">👑 VIP Plans</h2>
    <div v-for="p in plans" :key="p.plan" class="card">
      <h3>✨ {{ p.plan }} - ${{ p.price }}</h3>
      <p class="muted">{{ p.benefits.join(", ") }}</p>
      <button @click="upgrade(p.plan)">🚀 Upgrade</button>
    </div>
  </main>
</template>
