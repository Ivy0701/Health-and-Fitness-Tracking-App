<script setup>
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import api from "../services/api";

const router = useRouter();

const bmi = ref(null);
const submitError = ref("");

const form = reactive({
  gender: "male",
  height_cm: "",
  weight_kg: "",
  age: "",
  target_weight_kg: "",
});

const errors = reactive({
  gender: "",
  height_cm: "",
  weight_kg: "",
  age: "",
  target_weight_kg: "",
});

const bmiCategory = computed(() => {
  const v = Number(bmi.value);
  if (!Number.isFinite(v)) return "";
  if (v < 18.5) return "Underweight";
  if (v < 25) return "Normal";
  if (v < 30) return "Overweight";
  return "Obesity";
});

function setError(key, message) {
  errors[key] = message;
}

function clearErrors() {
  Object.keys(errors).forEach((k) => (errors[k] = ""));
}

function validate() {
  clearErrors();
  let ok = true;

  if (!form.gender) {
    setError("gender", "Gender is required.");
    ok = false;
  }

  const height = Number(form.height_cm);
  const weight = Number(form.weight_kg);
  const age = Number(form.age);
  const targetWeight = Number(form.target_weight_kg);

  if (!Number.isFinite(height) || height < 50 || height > 250) {
    setError("height_cm", "Enter a valid height (50-250 cm).");
    ok = false;
  }
  if (!Number.isFinite(weight) || weight < 20 || weight > 300) {
    setError("weight_kg", "Enter a valid weight (20-300 kg).");
    ok = false;
  }
  if (!Number.isFinite(age) || age < 10 || age > 120) {
    setError("age", "Enter a valid age (10-120 years).");
    ok = false;
  }
  if (!Number.isFinite(targetWeight) || targetWeight < 20 || targetWeight > 300) {
    setError("target_weight_kg", "Enter a valid target weight (20-300 kg).");
    ok = false;
  }

  return ok;
}

function calc() {
  if (!validate()) return false;
  const h = Number(form.height_cm) / 100;
  const next = Number(form.weight_kg) / (h * h);
  bmi.value = next.toFixed(2);
  return true;
}

async function submit() {
  submitError.value = "";
  const ok = calc();
  if (!ok) return;

  // Backend currently requires `target_weight_kg` (NOT NULL).
  const payload = {
    gender: form.gender,
    height_cm: Number(form.height_cm),
    weight_kg: Number(form.weight_kg),
    age: Number(form.age),
    target_weight_kg: Number(form.target_weight_kg),
  };

  try {
    await api.post("/assessments", payload);
    router.push("/dashboard");
  } catch (e) {
    submitError.value = e?.response?.data?.message || "Failed to save assessment.";
  }
}
</script>

<template>
  <main class="page">
    <section class="panel form-wrap">
      <h2 class="title">🩺 Health Assessment</h2>

      <form novalidate @submit.prevent="submit">
        <div class="field">
          <label class="label" for="gender">Gender</label>
          <select id="gender" v-model="form.gender">
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <div v-if="errors.gender" class="error">{{ errors.gender }}</div>
        </div>

        <div class="field">
          <label class="label" for="height_cm">Height</label>
          <input
            id="height_cm"
            v-model="form.height_cm"
            class="input"
            type="number"
            inputmode="decimal"
            min="50"
            max="250"
            step="1"
            placeholder="Please enter your height (cm)"
          />
          <div v-if="errors.height_cm" class="error">{{ errors.height_cm }}</div>
        </div>

        <div class="field">
          <label class="label" for="weight_kg">Weight</label>
          <input
            id="weight_kg"
            v-model="form.weight_kg"
            class="input"
            type="number"
            inputmode="decimal"
            min="20"
            max="300"
            step="1"
            placeholder="Please enter your weight (kg)"
          />
          <div v-if="errors.weight_kg" class="error">{{ errors.weight_kg }}</div>
        </div>

        <div class="field">
          <label class="label" for="age">Age</label>
          <input
            id="age"
            v-model="form.age"
            class="input"
            type="number"
            inputmode="numeric"
            min="10"
            max="120"
            step="1"
            placeholder="Please enter your age (years)"
          />
          <div v-if="errors.age" class="error">{{ errors.age }}</div>
        </div>

        <div class="field">
          <label class="label" for="target_weight_kg">Target Weight</label>
          <input
            id="target_weight_kg"
            v-model="form.target_weight_kg"
            class="input"
            type="number"
            inputmode="numeric"
            min="20"
            max="300"
            step="1"
            placeholder="Please enter your target weight (kg)"
          />
          <div v-if="errors.target_weight_kg" class="error">{{ errors.target_weight_kg }}</div>
        </div>

        <button type="button" @click="calc">Calculate BMI</button>

        <p v-if="bmi" class="bmi">
          BMI Result: <strong>{{ bmi }}</strong>
          <span v-if="bmiCategory"> ({{ bmiCategory }})</span>
        </p>

        <div v-if="submitError" class="error submit-error">{{ submitError }}</div>

        <button type="submit">Save Assessment</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.form-wrap {
  max-width: 560px;
  margin: 20px auto;
}

.field {
  display: grid;
  gap: 6px;
  margin-bottom: 10px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c5);
}

.input {
  border-radius: 10px;
  padding: 10px;
}

.bmi {
  background: #e8f8f5;
  border: 1px solid #bfe2db;
  border-radius: 10px;
  padding: 10px;
  margin: 0;
}

.error {
  font-size: 12px;
  color: #c0392b;
}

.submit-error {
  margin-top: -6px;
}
</style>
