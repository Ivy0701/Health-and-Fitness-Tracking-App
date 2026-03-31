<script setup>
import { reactive, ref, watch } from "vue";
import { useBmiStore } from "../stores/bmi";
import { calculateBmiValue, formatBmi, getBmiCategoryLabel } from "../utils/bmi";

const bmiStore = useBmiStore();

const heightCm = ref("");
const weightKg = ref("");
const localBmi = ref(null);
const localCategory = ref("");

watch(
  () => [bmiStore.sessionBmi, bmiStore.sessionCategory],
  ([bmiVal, catVal]) => {
    if (bmiVal) {
      localBmi.value = bmiVal;
      localCategory.value = catVal || getBmiCategoryLabel(bmiVal);
    } else {
      localBmi.value = null;
      localCategory.value = "";
    }
  },
  { immediate: true }
);

const errors = reactive({
  height_cm: "",
  weight_kg: "",
});

function clearErrors() {
  errors.height_cm = "";
  errors.weight_kg = "";
}

function validate() {
  clearErrors();
  let ok = true;
  const height = Number(heightCm.value);
  const weight = Number(weightKg.value);
  if (!Number.isFinite(height) || height < 50 || height > 250) {
    errors.height_cm = "Enter a valid height (50–250 cm).";
    ok = false;
  }
  if (!Number.isFinite(weight) || weight < 20 || weight > 300) {
    errors.weight_kg = "Enter a valid weight (20–300 kg).";
    ok = false;
  }
  return ok;
}

function calculate() {
  if (!validate()) {
    localBmi.value = null;
    localCategory.value = "";
    return;
  }
  const raw = calculateBmiValue(weightKg.value, heightCm.value);
  const formatted = formatBmi(raw);
  const category = getBmiCategoryLabel(raw);
  localBmi.value = formatted;
  localCategory.value = category;
  bmiStore.setSessionBmi(formatted, category);
}
</script>

<template>
  <section class="bmi-panel panel">
    <h3 class="bmi-title">⚖️ BMI calculator</h3>
    <p class="hint">BMI = weight (kg) ÷ height (m)². The result syncs instantly everywhere (dashboard, profile, etc.).</p>
    <div class="grid grid-2">
      <div class="field">
        <label class="label" for="bmi-h">Height (cm)</label>
        <input
          id="bmi-h"
          v-model="heightCm"
          type="number"
          inputmode="decimal"
          min="50"
          max="250"
          step="0.1"
          placeholder="e.g. 170"
        />
        <p v-if="errors.height_cm" class="error">{{ errors.height_cm }}</p>
      </div>
      <div class="field">
        <label class="label" for="bmi-w">Weight (kg)</label>
        <input
          id="bmi-w"
          v-model="weightKg"
          type="number"
          inputmode="decimal"
          min="20"
          max="300"
          step="0.1"
          placeholder="e.g. 65"
        />
        <p v-if="errors.weight_kg" class="error">{{ errors.weight_kg }}</p>
      </div>
    </div>
    <button type="button" class="calc-btn" @click="calculate">Calculate BMI</button>
    <p v-if="localBmi" class="bmi-result">
      Result: <strong>{{ localBmi }}</strong>
      <span v-if="localCategory"> ({{ localCategory }})</span>
    </p>
  </section>
</template>

<style scoped>
.bmi-panel {
  margin-top: 18px;
}

.bmi-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
  color: var(--c6);
}

.hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: #486170;
  line-height: 1.45;
}

.field {
  display: grid;
  gap: 4px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c5);
}

.error {
  margin: 0;
  font-size: 12px;
  color: #c0392b;
}

.calc-btn {
  margin-top: 4px;
  justify-self: start;
}

.bmi-result {
  margin: 12px 0 0;
  background: #e8f8f5;
  border: 1px solid #bfe2db;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 15px;
}
</style>
