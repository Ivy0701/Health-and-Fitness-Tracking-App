import { onMounted, ref } from "vue";
import { generateClientCaptchaString } from "./clientCaptcha.js";

/**
 * Same lifecycle as user login: generate on mount, expose code + regenerate for refresh / after errors.
 */
export function useClientCaptcha() {
  const captchaCode = ref("");

  function regenerate() {
    captchaCode.value = generateClientCaptchaString();
  }

  onMounted(regenerate);

  return { captchaCode, regenerate };
}
