<script setup>
import { onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: "VIP Only" },
  message: { type: String, default: "Upgrade to unlock this premium feature." },
  confirmText: { type: String, default: "Upgrade to VIP" },
  /** Pass empty string to hide the secondary action. */
  cancelText: { type: String, default: "Maybe Later" },
});

const emit = defineEmits(["update:modelValue", "confirm"]);

const router = useRouter();

function close() {
  emit("update:modelValue", false);
}

function onConfirm() {
  emit("confirm");
  close();
  router.push("/vip");
}

function onBackdropClick() {
  close();
}

function onKeydown(e) {
  if (e.key === "Escape" && props.modelValue) {
    e.preventDefault();
    close();
  }
}

function setBodyScrollLocked(locked) {
  if (typeof document === "undefined") return;
  document.body.style.overflow = locked ? "hidden" : "";
}

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document === "undefined") return;
    if (open) {
      document.addEventListener("keydown", onKeydown);
      setBodyScrollLocked(true);
    } else {
      document.removeEventListener("keydown", onKeydown);
      setBodyScrollLocked(false);
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (typeof document !== "undefined") {
    document.removeEventListener("keydown", onKeydown);
    setBodyScrollLocked(false);
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="vip-prompt-backdrop"
      role="presentation"
      @click.self="onBackdropClick"
    >
      <div
        class="vip-prompt-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vip-prompt-title"
        :aria-describedby="message ? 'vip-prompt-message' : undefined"
        @click.stop
      >
        <button type="button" class="vip-prompt-close" aria-label="Close" @click="close">×</button>
        <div class="vip-prompt-icon" aria-hidden="true">🔒</div>
        <h3 id="vip-prompt-title" class="vip-prompt-title">{{ title }}</h3>
        <p v-if="message" id="vip-prompt-message" class="vip-prompt-message">{{ message }}</p>
        <div class="vip-prompt-actions">
          <button
            v-if="cancelText"
            type="button"
            class="vip-prompt-btn vip-prompt-btn--ghost"
            @click="close"
          >
            {{ cancelText }}
          </button>
          <button type="button" class="vip-prompt-btn vip-prompt-btn--primary" @click="onConfirm">
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vip-prompt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  background: rgba(22, 52, 56, 0.38);
  backdrop-filter: blur(2px);
}

.vip-prompt-card {
  position: relative;
  width: min(100%, 400px);
  max-width: 400px;
  margin: 0 auto;
  padding: 26px 24px 22px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(45, 90, 94, 0.1);
  box-shadow:
    0 22px 50px rgba(35, 72, 78, 0.12),
    0 6px 16px rgba(35, 72, 78, 0.06);
  box-sizing: border-box;
}

.vip-prompt-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: rgba(45, 90, 94, 0.06);
  color: #2d5a5e;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.vip-prompt-close:hover {
  background: rgba(45, 90, 94, 0.12);
  color: #1f4548;
}

.vip-prompt-icon {
  font-size: 30px;
  line-height: 1;
  text-align: center;
  margin: 4px 0 0;
}

.vip-prompt-title {
  margin: 14px 0 0;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #1a2f32;
  text-align: center;
}

.vip-prompt-message {
  margin: 10px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: #4f6a76;
  text-align: center;
}

.vip-prompt-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
}

.vip-prompt-btn {
  min-height: 42px;
  padding: 0 18px;
  border-radius: 11px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    filter 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}

.vip-prompt-btn--ghost {
  background: #fff;
  border-color: #c8ded7;
  color: #2d5a5e;
}

.vip-prompt-btn--ghost:hover {
  border-color: #9ec9be;
  background: #f6fbfa;
}

.vip-prompt-btn--primary {
  border-color: #2f8f7d;
  background: linear-gradient(135deg, #49b89f, #2f8f7d);
  color: #fff;
  box-shadow: 0 4px 14px rgba(47, 143, 125, 0.28);
}

.vip-prompt-btn--primary:hover {
  filter: brightness(1.04);
}

@media (max-width: 420px) {
  .vip-prompt-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .vip-prompt-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
