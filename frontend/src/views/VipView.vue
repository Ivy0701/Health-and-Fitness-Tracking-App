<script setup>
import { onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const me = ref(null);
const status = ref(null);

async function load() {
  me.value = await api.get("/users/me").then((r) => r.data);
  status.value = await api.get(`/vip/status/${me.value.id}`).then((r) => r.data);
  auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
}

async function upgrade(plan) {
  status.value = await api.post("/vip/upgrade", { userId: me.value.id, vipPlan: plan }).then((r) => r.data);
  auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
}

async function cancelVip() {
  const ok = window.confirm("Are you sure you want to cancel your VIP membership?");
  if (!ok) return;
  status.value = await api.post("/vip/cancel", { userId: me.value.id }).then((r) => r.data);
  auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
}

onMounted(load);
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">👑 VIP</h2>
    <section class="panel">
      <p>Membership Status: <strong>{{ status?.vip_status ? "VIP Active" : "Free User" }}</strong></p>
      <p>Current Plan: <strong>{{ status?.vipPlan || "none" }}</strong></p>
      <p>VIP Since: <strong>{{ status?.vipSince ? new Date(status.vipSince).toLocaleDateString() : "-" }}</strong></p>
      <p>Subscription Ends: <strong>{{ status?.vipEndDate ? new Date(status.vipEndDate).toLocaleDateString() : "-" }}</strong></p>

      <div class="grid grid-2 plans">
        <article class="card">
          <h3>Monthly Plan</h3>
          <p class="muted">Priority support, advanced analytics, and premium templates.</p>
          <button @click="upgrade('monthly')">Upgrade to Monthly</button>
        </article>
        <article class="card">
          <h3>Yearly Plan</h3>
          <p class="muted">All premium features with better long-term value.</p>
          <button @click="upgrade('yearly')">Upgrade to Yearly</button>
        </article>
      </div>

      <div v-if="status?.vip_status" class="cancel-box">
        <button class="cancel-btn" @click="cancelVip">Cancel VIP Membership</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.plans { margin-top: 14px; }
.cancel-box { margin-top: 14px; display: flex; justify-content: flex-end; }
.cancel-btn {
  border: 1px solid #e5bcbc;
  background: #fff4f4;
  color: #8f2d2d;
}
</style>

