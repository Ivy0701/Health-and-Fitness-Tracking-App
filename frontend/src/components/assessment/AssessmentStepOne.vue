<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
  error: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:modelValue", "next"]);

const age = computed({
  get: () => props.modelValue.age,
  set: (value) => emit("update:modelValue", { ...props.modelValue, age: value }),
});

const gender = computed(() => props.modelValue.gender);

function setGender(value) {
  emit("update:modelValue", { ...props.modelValue, gender: value });
}
</script>

<template>
  <section class="panel step-card">
    <h2 class="title">Basic Assessment</h2>
    <p class="muted">Step 1 of 2</p>

    <div class="field">
      <p class="label">Select your gender</p>
      <div class="gender-grid">
        <button type="button" class="gender-btn" :class="{ active: gender === 'male' }" @click="setGender('male')">
          Male
        </button>
        <button type="button" class="gender-btn" :class="{ active: gender === 'female' }" @click="setGender('female')">
          Female
        </button>
      </div>
    </div>

    <div class="field">
      <label class="label" for="assessment-age">Enter your age</label>
      <input id="assessment-age" v-model.number="age" type="number" min="5" max="100" placeholder="Age (5-100)" />
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div class="actions">
      <button type="button" @click="emit('next')">Next</button>
    </div>
  </section>
</template>

<style scoped>
.step-card {
  max-width: 620px;
  margin: 30px auto;
}

.field {
  margin-top: 14px;
}

.label {
  margin: 0 0 8px;
  font-weight: 600;
  color: var(--c5);
}

.gender-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.gender-btn {
  background: #fff;
  color: var(--c6);
  border: 1px solid #cde0dc;
  border-radius: 12px;
  padding: 14px 12px;
  font-weight: 600;
}

.gender-btn.active {
  background: linear-gradient(90deg, var(--c4), var(--c5));
  border-color: transparent;
  color: #fff;
}

.error {
  color: #b42318;
  margin: 10px 0 0;
}

.actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}
</style>
