<script setup>
import { computed, onMounted, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const me = ref(null);
const status = ref(null);
const loading = ref(false);

const featureRows = [
  { name: "Premium course access", free: "Locked", vip: "Full access" },
  { name: "Start premium courses", free: "Upgrade required", vip: "Available now" },
  { name: "Support priority", free: "Standard queue", vip: "Priority queue" },
  { name: "Plan options", free: "No subscription", vip: "Monthly / Yearly" },
];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

const isVipActive = computed(() => Boolean(status.value?.vip_status));
const vipPlanLabel = computed(() => status.value?.vipPlan || "none");
const vipSinceLabel = computed(() => formatDate(status.value?.vipSince));
const vipEndLabel = computed(() => formatDate(status.value?.vipEndDate));

const daysLeft = computed(() => {
  if (!status.value?.vipEndDate || !isVipActive.value) return null;
  const end = new Date(status.value.vipEndDate).setHours(23, 59, 59, 999);
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
});

const statusHint = computed(() => {
  if (!isVipActive.value) return "Upgrade to unlock premium courses and priority benefits.";
  if (daysLeft.value === 0) return "Your VIP expires today. Renew to keep premium access uninterrupted.";
  if (daysLeft.value != null && daysLeft.value <= 7) return `Your VIP expires in ${daysLeft.value} day(s).`;
  return "Your VIP is active and all premium learning features are available.";
});

const recommendedPlan = computed(() => {
  if (!isVipActive.value) return "yearly";
  return status.value?.vipPlan === "yearly" ? "yearly" : "monthly";
});

async function load() {
  loading.value = true;
  me.value = await api.get("/users/me").then((r) => r.data);
  status.value = await api.get(`/vip/status/${me.value.id}`).then((r) => r.data);
  auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
  loading.value = false;
}

async function upgrade(plan) {
  if (!me.value?.id) return;
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
      <p v-if="loading" class="muted">Loading VIP status...</p>
      <template v-else>
        <p>
          Membership Status:
          <strong :class="isVipActive ? 'text-ok' : 'text-muted'">{{ isVipActive ? "VIP Active" : "Free User" }}</strong>
        </p>
        <p>Current Plan: <strong>{{ vipPlanLabel }}</strong></p>
        <p>VIP Since: <strong>{{ vipSinceLabel }}</strong></p>
        <p>Subscription Ends: <strong>{{ vipEndLabel }}</strong></p>
        <p v-if="daysLeft != null" class="muted">Days Remaining: <strong>{{ daysLeft }}</strong></p>
        <p class="hint">{{ statusHint }}</p>
      </template>

      <div class="grid grid-2 plans">
        <article class="card" :class="{ recommended: recommendedPlan === 'monthly' }">
          <h3>Monthly Plan</h3>
          <p class="muted">Flexible monthly billing for short-term goals and trial periods.</p>
          <button @click="upgrade('monthly')">Upgrade to Monthly</button>
        </article>
        <article class="card" :class="{ recommended: recommendedPlan === 'yearly' }">
          <h3>Yearly Plan</h3>
          <p class="muted">Best long-term value with uninterrupted premium training access.</p>
          <button @click="upgrade('yearly')">Upgrade to Yearly</button>
        </article>
      </div>

      <section class="compare panel-lite">
        <h3>Free vs VIP comparison</h3>
        <div class="compare-table">
          <div class="row head">
            <span>Feature</span>
            <span>Free</span>
            <span>VIP</span>
          </div>
          <div v-for="item in featureRows" :key="item.name" class="row">
            <span>{{ item.name }}</span>
            <span class="bad">{{ item.free }}</span>
            <span class="good">{{ item.vip }}</span>
          </div>
        </div>
      </section>

      <section class="compare panel-lite">
        <h3>VIP extra benefits</h3>
        <ul class="benefits">
          <li>Unlock premium courses directly from the Courses page.</li>
          <li>Use one-click enrollment to add full-term sessions into your schedule.</li>
          <li>Receive conflict reminders while keeping the option to continue.</li>
          <li>Keep access continuity with expiry warnings and renew anytime.</li>
        </ul>
      </section>

      <div v-if="status?.vip_status" class="cancel-box">
        <button class="cancel-btn" @click="cancelVip">Cancel VIP Membership</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.plans { margin-top: 14px; }
.recommended {
  border: 1px solid #9ad8d3;
  box-shadow: 0 8px 18px rgba(49, 104, 121, 0.12);
}
.panel-lite {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #d7e7e6;
  border-radius: 12px;
  background: #fbfefd;
}
.compare-table {
  display: grid;
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 10px;
  align-items: center;
  font-size: 14px;
}
.row.head {
  font-weight: 700;
  color: #2f4858;
}
.bad { color: #8f2d2d; }
.good { color: #117a52; }
.benefits {
  margin: 8px 0 0;
  padding-left: 18px;
}
.hint {
  margin-top: 4px;
  color: #486170;
  font-size: 13px;
}
.text-ok { color: #117a52; }
.text-muted { color: #486170; }
.cancel-box { margin-top: 14px; display: flex; justify-content: flex-end; }
.cancel-btn {
  border: 1px solid #e5bcbc;
  background: #fff4f4;
  color: #8f2d2d;
}
</style>

