<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import api from "../services/api";

const router = useRouter();
const bmi = ref(null);
const form = reactive({
  gender: "male",
  height_cm: 170,
  weight_kg: 65,
  age: 22,
  target_weight_kg: 60
});

function calc() {
  const h = form.height_cm / 100;
  bmi.value = (form.weight_kg / (h * h)).toFixed(2);
}

async function submit() {
  calc();
  await api.post("/assessments", form);
  router.push("/dashboard");
}
</script>

<template>
  <main class="page">
    <section class="panel form-wrap">
      <h2 class="title">🩺 Health Assessment</h2>
      <form @submit.prevent="submit">
        <select v-model="form.gender">
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
        <input v-model.number="form.height_cm" type="number" placeholder="Height (cm)" />
        <input v-model.number="form.weight_kg" type="number" placeholder="Weight (kg)" />
        <input v-model.number="form.age" type="number" placeholder="Age" />
        <input v-model.number="form.target_weight_kg" type="number" placeholder="Target Weight (kg)" />
        <button type="button" @click="calc">📏 Calculate BMI</button>
        <p v-if="bmi" class="bmi">BMI Result: <strong>{{ bmi }}</strong> 🎯</p>
        <button type="submit">💾 Save Assessment</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.form-wrap { max-width: 560px; margin: 20px auto; }
.bmi { background: #e8f8f5; border: 1px solid #bfe2db; border-radius: 10px; padding: 10px; margin: 0; }
</style>
