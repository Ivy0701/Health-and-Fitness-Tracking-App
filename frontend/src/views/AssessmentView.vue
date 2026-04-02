<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import api from "../services/api";
import AssessmentStepOne from "../components/assessment/AssessmentStepOne.vue";
import AssessmentStepTwo from "../components/assessment/AssessmentStepTwo.vue";

const DRAFT_KEY = "assessment_draft_v1";
const router = useRouter();
const auth = useAuthStore();

const step = ref(1);
const saving = ref(false);
const stepOneError = ref("");
const stepTwoError = ref("");

const form = reactive({
  gender: "male",
  age: 18,
  height: 170,
  weight: 60,
});

function updateForm(nextValue) {
  Object.assign(form, nextValue);
}

function hydrateDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data?.form) {
      form.gender = data.form.gender || form.gender;
      form.age = Number(data.form.age) || form.age;
      form.height = Number(data.form.height) || form.height;
      form.weight = Number(data.form.weight) || form.weight;
    }
    if (data?.step === 1 || data?.step === 2) step.value = data.step;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

watch(
  () => ({ step: step.value, form: { ...form } }),
  (value) => localStorage.setItem(DRAFT_KEY, JSON.stringify(value)),
  { deep: true }
);

const bmi = computed(() => {
  const heightM = Number(form.height) / 100;
  const weight = Number(form.weight);
  if (!heightM || !Number.isFinite(heightM) || !Number.isFinite(weight)) return 0;
  return weight / (heightM * heightM);
});

const bmiCategory = computed(() => {
  if (bmi.value < 18.5) return "Underweight";
  if (bmi.value < 25) return "Normal";
  if (bmi.value < 30) return "Overweight";
  return "Obese";
});

function validateStepOne() {
  if (!["male", "female"].includes(form.gender)) {
    stepOneError.value = "Please select your gender.";
    return false;
  }
  const age = Number(form.age);
  if (!Number.isInteger(age) || age < 5 || age > 100) {
    stepOneError.value = "Please enter a valid age between 5 and 100.";
    return false;
  }
  stepOneError.value = "";
  return true;
}

function validateStepTwo() {
  const height = Number(form.height);
  const weight = Number(form.weight);
  if (!Number.isFinite(height) || height < 120 || height > 220) {
    stepTwoError.value = "Height must be between 120 and 220 cm.";
    return false;
  }
  if (!Number.isFinite(weight) || weight < 30 || weight > 150) {
    stepTwoError.value = "Weight must be between 30 and 150 kg.";
    return false;
  }
  stepTwoError.value = "";
  return true;
}

function goNext() {
  if (!validateStepOne()) return;
  step.value = 2;
}

async function finish() {
  if (!validateStepTwo()) return;
  saving.value = true;
  stepTwoError.value = "";
  try {
    const payload = {
      gender: form.gender,
      age: Number(form.age),
      height: Number(form.height),
      weight: Number(form.weight),
      bmi: Number(bmi.value.toFixed(1)),
    };
    const { data } = await api.post("/user/assessment", payload);
    auth.user = data.user;
    localStorage.removeItem(DRAFT_KEY);
    router.replace("/dashboard");
  } catch (error) {
    stepTwoError.value = error?.response?.data?.message || "Failed to save assessment. Please try again.";
  } finally {
    saving.value = false;
  }
}

hydrateDraft();
</script>

<template>
  <main class="page">
    <AssessmentStepOne v-if="step === 1" :model-value="form" :error="stepOneError" @update:model-value="updateForm" @next="goNext" />
    <AssessmentStepTwo
      v-else
      :model-value="form"
      @update:model-value="updateForm"
      :bmi="bmi"
      :bmi-category="bmiCategory"
      :saving="saving"
      :error="stepTwoError"
      @back="step = 1"
      @finish="finish"
    />
  </main>
</template>
