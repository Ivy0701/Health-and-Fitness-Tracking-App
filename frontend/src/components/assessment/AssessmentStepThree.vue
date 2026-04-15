<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  saving: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "back", "finish"]);

const targetWeight = computed({
  get: () => props.modelValue.targetWeight,
  set: (value) => emit("update:modelValue", { ...props.modelValue, targetWeight: Number(value) }),
});

const targetDays = computed({
  get: () => props.modelValue.targetDays,
  set: (value) => emit("update:modelValue", { ...props.modelValue, targetDays: Number(value) }),
});
</script>

<template>
  <section class="panel step-card">
    <h2 class="title">Basic Assessment</h2>
    <p class="muted">Step 3 of 3</p>

    <div class="target-grid">
      <div class="target-box">
        <label class="label" for="target-weight">Target weight (kg)</label>
        <input id="target-weight" v-model.number="targetWeight" type="number" min="30" max="200" step="0.1" />
      </div>
      <div class="target-box">
        <label class="label" for="target-days">Target days</label>
        <input id="target-days" v-model.number="targetDays" type="number" min="7" max="365" step="1" />
      </div>
    </div>

    <p class="muted helper-line">Set a realistic goal for better health progress.</p>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="actions">
      <button type="button" class="ghost" @click="emit('back')">Back</button>
      <button type="button" :disabled="saving" @click="emit('finish')">
        {{ saving ? "Saving..." : "Finish" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.step-card {
  max-width: 720px;
  margin: 30px auto;
}

.target-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.target-box {
  border: 1px solid #d4e6e2;
  border-radius: 16px;
  background: #f8fcfb;
  padding: 16px;
  display: grid;
  gap: 8px;
}

.label {
  margin: 0;
  color: var(--c5);
  font-weight: 600;
}

.helper-line {
  margin: 10px 0 0;
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
