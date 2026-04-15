<script setup>
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import api from "../services/api";
import AssessmentStepOne from "../components/assessment/AssessmentStepOne.vue";
import AssessmentStepTwo from "../components/assessment/AssessmentStepTwo.vue";
import AssessmentStepThree from "../components/assessment/AssessmentStepThree.vue";

const DRAFT_KEY = "assessment_draft_v1";
const router = useRouter();
const auth = useAuthStore();

const step = ref(1);
const saving = ref(false);
const stepOneError = ref("");
const stepTwoError = ref("");
const stepThreeError = ref("");

const form = reactive({
  gender: "male",
  age: 18,
  height: 170,
  weight: 60,
  targetWeight: 60,
  targetDays: 30,
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
      form.targetWeight = Number(data.form.targetWeight) || form.targetWeight;
      form.targetDays = Number(data.form.targetDays) || form.targetDays;
    }
    if (data?.step === 1 || data?.step === 2 || data?.step === 3) step.value = data.step;
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

function goToTargetSetup() {
  if (!validateStepTwo()) return;
  if (!Number.isFinite(Number(form.targetWeight)) || Number(form.targetWeight) <= 0) {
    form.targetWeight = Number(form.weight);
  }
  if (!Number.isInteger(Number(form.targetDays)) || Number(form.targetDays) <= 0) {
    form.targetDays = 30;
  }
  step.value = 3;
}

function evaluateGoalPace(currentWeight, targetWeight, targetDays) {
  const weeks = targetDays / 7;
  if (!Number.isFinite(weeks) || weeks <= 0) {
    return { ok: false, message: "Please set a more realistic goal." };
  }
  if (targetWeight < currentWeight) {
    const lossPerWeek = (currentWeight - targetWeight) / weeks;
    if (lossPerWeek > 1.5) {
      return {
        ok: false,
        message: "This weight-loss goal is too aggressive. Please choose a more realistic timeline.",
      };
    }
    return { ok: true, message: "" };
  }
  if (targetWeight > currentWeight) {
    const gainPerWeek = (targetWeight - currentWeight) / weeks;
    if (gainPerWeek > 1) {
      return {
        ok: false,
        message: "This weight-gain goal is too aggressive. Please choose a more realistic timeline.",
      };
    }
    return { ok: true, message: "" };
  }
  return { ok: true, message: "" };
}

function getStepThreeErrorMessage() {
  const currentWeight = Number(form.weight);
  const targetWeight = Number(form.targetWeight);
  const targetDays = Number(form.targetDays);

  if (!Number.isFinite(targetWeight) || targetWeight < 30 || targetWeight > 200) {
    return "Target weight must be between 30 and 200 kg.";
  }
  if (!Number.isInteger(targetDays) || targetDays < 7 || targetDays > 365) {
    return "Target days must be an integer between 7 and 365.";
  }

  const paceCheck = evaluateGoalPace(currentWeight, targetWeight, targetDays);
  if (!paceCheck.ok) {
    return paceCheck.message || "Please set a more realistic goal.";
  }
  return "";
}

function validateStepThree() {
  const message = getStepThreeErrorMessage();
  stepThreeError.value = message;
  return !message;
}

async function finish() {
  if (!validateStepThree()) return;
  saving.value = true;
  stepThreeError.value = "";
  try {
    const payload = {
      gender: form.gender,
      age: Number(form.age),
      height: Number(form.height),
      weight: Number(form.weight),
      targetWeight: Number(form.targetWeight),
      targetDays: Number(form.targetDays),
      bmi: Number(bmi.value.toFixed(1)),
    };
    const { data } = await api.post("/user/assessment", payload);
    auth.user = data.user;
    localStorage.removeItem(DRAFT_KEY);
    router.replace("/dashboard");
  } catch (error) {
    stepThreeError.value = error?.response?.data?.message || "Failed to save assessment. Please try again.";
  } finally {
    saving.value = false;
  }
}

hydrateDraft();

watch(
  () => [step.value, form.weight, form.targetWeight, form.targetDays],
  () => {
    if (step.value !== 3) return;
    stepThreeError.value = getStepThreeErrorMessage();
  }
);
</script>

<template>
  <main class="page">
    <AssessmentStepOne v-if="step === 1" :model-value="form" :error="stepOneError" @update:model-value="updateForm" @next="goNext" />
    <AssessmentStepTwo
      v-else-if="step === 2"
      :model-value="form"
      @update:model-value="updateForm"
      :bmi="bmi"
      :bmi-category="bmiCategory"
      :error="stepTwoError"
      @back="step = 1"
      @next="goToTargetSetup"
      @finish="goToTargetSetup"
    />
    <AssessmentStepThree
      v-else
      :model-value="form"
      @update:model-value="updateForm"
      :saving="saving"
      :error="stepThreeError"
      @back="step = 2"
      @finish="finish"
    />
  </main>
</template>

<style scoped></style>
