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
    <h2>VIP</h2>
    <div v-for="p in plans" :key="p.plan" class="card">
      <h3>{{ p.plan }} - ${{ p.price }}</h3>
      <p>{{ p.benefits.join(", ") }}</p>
      <button @click="upgrade(p.plan)">Upgrade</button>
    </div>
  </main>
</template>

<style scoped>
.page { padding: 24px; }
.card { border: 1px solid #ddd; margin-bottom: 12px; padding: 12px; }
</style>
