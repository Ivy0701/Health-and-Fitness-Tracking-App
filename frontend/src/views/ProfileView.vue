<script setup>
import { onMounted, reactive, ref } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";

const profile = ref(null);
const state = reactive({ error: "", success: "" });
const form = reactive({
  username: "",
  gender: "prefer_not_to_say",
  age: "",
  height: "",
  weight: "",
  targetWeight: "",
  activityLevel: "moderate",
  goal: "",
  heartRate: "",
  avatar: "",
});

function fillForm(data) {
  form.username = data.username || "";
  form.gender = data.gender || "prefer_not_to_say";
  form.age = data.age || "";
  form.height = data.height || "";
  form.weight = data.weight || "";
  form.targetWeight = data.targetWeight || "";
  form.activityLevel = data.activityLevel || "moderate";
  form.goal = data.goal || "";
  form.heartRate = data.heartRate || "";
  form.avatar = data.avatar || "";
}

async function load() {
  state.error = "";
  const { data } = await api.get("/user/profile");
  profile.value = data;
  fillForm(data);
}

async function save() {
  state.error = "";
  state.success = "";
  try {
    const { data } = await api.put("/user/profile", {
      ...form,
      age: form.age ? Number(form.age) : undefined,
      height: form.height ? Number(form.height) : undefined,
      weight: form.weight ? Number(form.weight) : undefined,
      targetWeight: form.targetWeight ? Number(form.targetWeight) : undefined,
      heartRate: form.heartRate ? Number(form.heartRate) : undefined,
    });
    profile.value = data;
    fillForm(data);
    state.success = "Profile updated successfully.";
  } catch (error) {
    state.error = error?.response?.data?.message || "Failed to update profile.";
  }
}

onMounted(async () => {
  try {
    await load();
  } catch (error) {
    state.error = error?.response?.data?.message || "Failed to load profile.";
  }
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">👤 Profile</h2>
    <section v-if="profile" class="panel">
      <p>📧 Email: <strong>{{ profile.email }}</strong></p>
      <p>📈 Current BMI: <strong>{{ profile.bmi || "-" }}</strong></p>
      <form novalidate @submit.prevent="save">
        <input v-model="form.username" placeholder="Username" />
        <div class="grid grid-2">
          <select v-model="form.gender">
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
          <input v-model="form.age" type="number" placeholder="Age" />
        </div>
        <div class="grid grid-2">
          <input v-model="form.height" type="number" placeholder="Height (cm)" />
          <input v-model="form.weight" type="number" placeholder="Weight (kg)" />
        </div>
        <div class="grid grid-2">
          <input v-model="form.targetWeight" type="number" placeholder="Target Weight (kg)" />
          <input v-model="form.heartRate" type="number" placeholder="Heart Rate (bpm)" />
        </div>
        <input v-model="form.goal" placeholder="Goal" />
        <select v-model="form.activityLevel">
          <option value="sedentary">Sedentary</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="active">Active</option>
          <option value="very_active">Very Active</option>
        </select>
        <input v-model="form.avatar" placeholder="Avatar URL" />
        <button type="submit">Save Profile</button>
      </form>
      <p v-if="state.success" class="success">{{ state.success }}</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </section>
    <p v-else-if="state.error" class="muted">{{ state.error }}</p>
  </main>
</template>

<style scoped>
.success { color: #117a52; margin-top: 8px; }
.error { color: #b42318; margin-top: 8px; }
</style>
