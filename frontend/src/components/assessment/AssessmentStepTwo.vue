<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  bmi: {
    type: Number,
    required: true,
  },
  bmiCategory: {
    type: String,
    default: "",
  },
  error: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "back", "next", "finish"]);

const height = computed({
  get: () => props.modelValue.height,
  set: (value) => emit("update:modelValue", { ...props.modelValue, height: Number(value) }),
});

const weight = computed({
  get: () => props.modelValue.weight,
  set: (value) => emit("update:modelValue", { ...props.modelValue, weight: Number(value) }),
});

function handleNext() {
  emit("next");
  // Keep compatibility with listeners still expecting "finish" on step two.
  emit("finish");
}
</script>

<template>
  <section class="panel step-card">
    <h2 class="title">Basic Assessment</h2>
    <p class="muted">Step 2 of 3</p>

    <div class="slider-grid">
      <div class="slider-box">
        <p class="label">Height</p>
        <p class="value">{{ height }} cm</p>
        <input v-model.number="height" class="vertical-slider" type="range" min="120" max="220" step="1" />
      </div>
      <div class="slider-box">
        <p class="label">Weight</p>
        <p class="value">{{ weight }} kg</p>
        <input v-model.number="weight" class="vertical-slider" type="range" min="30" max="150" step="1" />
      </div>
    </div>

    <div class="bmi-box">
      <p class="bmi-title">BMI</p>
      <p class="bmi-value">{{ bmi.toFixed(1) }}</p>
      <p class="muted">{{ bmiCategory }}</p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="ghost" @click="emit('back')">Back</button>
      <button type="button" @click="handleNext">Next</button>
    </div>
  </section>
</template>

<style scoped>
.step-card {
  max-width: 720px;
  margin: 30px auto;
}

.slider-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.slider-box {
  border: 1px solid #d4e6e2;
  border-radius: 16px;
  background: #f8fcfb;
  padding: 16px;
  text-align: center;
  display: grid;
  justify-items: center;
  gap: 8px;
}

.label {
  margin: 0;
  color: var(--c5);
  font-weight: 600;
}

.value {
  margin: 0;
  color: var(--c6);
  font-size: 26px;
  font-weight: 700;
}

.vertical-slider {
  width: 180px;
  height: 180px;
  writing-mode: vertical-lr;
  direction: rtl;
  accent-color: var(--c4);
}

.bmi-box {
  margin-top: 16px;
  border-radius: 14px;
  border: 1px solid #cfe2dd;
  background: linear-gradient(140deg, rgba(112, 209, 172, 0.12), rgba(72, 174, 164, 0.2));
  padding: 14px;
  text-align: center;
}

.bmi-title {
  margin: 0;
  font-weight: 600;
  color: var(--c5);
}

.bmi-value {
  margin: 4px 0;
  font-size: 36px;
  font-weight: 700;
  color: var(--c6);
}

.error {
  color: #b42318;
  margin: 10px 0 0;
}

.actions {
  margin-top: 18px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.ghost {
  background: #fff;
  color: var(--c6);
  border: 1px solid #cde0dc;
}
</style>
