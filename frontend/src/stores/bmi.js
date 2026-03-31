import { defineStore } from "pinia";

export const useBmiStore = defineStore("bmi", {
  state: () => ({
    sessionBmi: null,
    sessionCategory: null,
  }),
  actions: {
    setSessionBmi(bmiStr, category = null) {
      this.sessionBmi = bmiStr;
      this.sessionCategory = category || null;
    },
    clearSession() {
      this.sessionBmi = null;
      this.sessionCategory = null;
    },
  },
});
