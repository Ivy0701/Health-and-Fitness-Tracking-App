<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, nextTick } from "vue";
import AppNavbar from "../components/common/AppNavbar.vue";
import api from "../services/api";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();
const me = ref(null);
const status = ref(null);
const loading = ref(false);
const showPaymentModal = ref(false);
const showPaymentFormModal = ref(false);
const pendingPlan = ref("");
const paymentSubmitting = ref(false);
const paymentError = ref("");
const paymentSuccess = ref("");
const paymentForm = reactive({
  areaCode: "+86",
  phoneNumber: "",
  paymentMethod: "",
  cardNumber: "",
});
const showActionConfirmModal = ref(false);
const actionSubmitting = ref(false);
const actionError = ref("");
const showRefundRequestModal = ref(false);
const refundSubmitting = ref(false);
const refundError = ref("");
const refundForm = reactive({
  reason: "",
  note: "",
});
/** Shown after successful refund request submit (not persisted). */
const refundSubmitBanner = ref(false);
/** One-time modal after admin approves/rejects (dismiss stores fingerprint in localStorage). */
const refundResultModal = ref(null);
let paymentSuccessTimer = null;
let refundPollTimer = null;
let refundSubmitBannerTimer = null;

const featureRows = [
  { name: "Premium course access", free: "Locked", vip: "Full access" },
  { name: "Start premium courses", free: "Upgrade required", vip: "Available now" },
  { name: "Premium diet recipes", free: "Only first 4 visible", vip: "All premium recipes unlocked" },
  { name: "Support priority", free: "Standard queue", vip: "Priority queue" },
  { name: "Plan options", free: "No subscription", vip: "Monthly / Yearly" },
];
const PAYMENT_PLANS = {
  monthly: {
    key: "monthly",
    label: "Monthly VIP",
    price: "38 HKD / month",
    billingCycle: "Billed monthly",
    benefits: ["Premium diet recipes", "AI diet assistant", "Advanced analytics"],
  },
  yearly: {
    key: "yearly",
    label: "Yearly VIP",
    price: "368 HKD / year",
    billingCycle: "Billed yearly",
    benefits: ["Premium diet recipes", "AI diet assistant", "Advanced analytics", "Better yearly value"],
  },
};
const PAYMENT_METHODS = [
  { key: "wechat", label: "WeChat Pay", icon: "💬" },
  { key: "alipay", label: "Alipay", icon: "💠" },
  { key: "card", label: "Credit Card", icon: "💳" },
];

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

/** VIP membership follows `vip_status` / `isVip` from the server — never infer from `refundStatus` alone. */
const isVipActive = computed(() => Boolean(status.value?.vip_status ?? status.value?.isVip));
const vipPlanLabel = computed(() => status.value?.vipPlan || "none");
const vipSinceLabel = computed(() => formatDate(status.value?.vipSince));
const vipEndLabel = computed(() => formatDate(status.value?.vipEndDate));
const selectedPaymentPlan = computed(() => PAYMENT_PLANS[pendingPlan.value] || null);
const refundStatus = computed(() => String(status.value?.refundStatus || "none"));
const refundWindowDays = computed(() => {
  if (!status.value?.vipSince || !isVipActive.value) return null;
  const vipSinceTs = new Date(status.value.vipSince).getTime();
  if (!Number.isFinite(vipSinceTs)) return null;
  const diffDays = Math.floor((Date.now() - vipSinceTs) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
});
const isWithinRefundWindow = computed(() => isVipActive.value && refundWindowDays.value != null && refundWindowDays.value <= 7);
const hasPendingRefundRequest = computed(() => refundStatus.value === "pending");
const canRequestRefund = computed(
  () => isWithinRefundWindow.value && isVipActive.value && (refundStatus.value === "none" || refundStatus.value === "rejected")
);
const canCancelSubscription = computed(() => isVipActive.value && !isWithinRefundWindow.value && !hasPendingRefundRequest.value);

const daysLeft = computed(() => {
  if (!status.value?.vipEndDate || !isVipActive.value) return null;
  const end = new Date(status.value.vipEndDate).setHours(23, 59, 59, 999);
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return 0;
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
});

const statusHint = computed(() => {
  if (!isVipActive.value) return "Upgrade to unlock premium courses and priority benefits.";
  if (daysLeft.value === 0) return "Your VIP expires today. Renew to keep premium access uninterrupted.";
  if (daysLeft.value != null && daysLeft.value <= 7) return `Your VIP expires in ${daysLeft.value} day(s).`;
  return "Your VIP is active and all premium learning features are available.";
});

const recommendedPlan = computed(() => {
  if (!isVipActive.value) return "yearly";
  return status.value?.vipPlan === "yearly" ? "yearly" : "monthly";
});

function refundResultFingerprint(s) {
  if (!s) return "";
  const rs = String(s.refundStatus || "none");
  if (rs !== "approved" && rs !== "rejected") return "";
  const rev = s.refundReviewedAt ? new Date(s.refundReviewedAt).toISOString() : "";
  return `${rs}|${rev}|${String(s.refundAdminNote || "").trim()}`;
}

function considerRefundResultModal() {
  const uid = String(me.value?.id || "").trim();
  if (!uid || !status.value) return;
  const fp = refundResultFingerprint(status.value);
  if (!fp) return;
  const key = `vip_refund_result_seen_${uid}`;
  if (localStorage.getItem(key) === fp) return;
  const rs = String(status.value.refundStatus || "");
  if (rs === "approved") {
    refundResultModal.value = {
      kind: "approved",
      title: "Refund request approved",
      body: "Your refund request has been approved successfully. Your VIP access has been ended as part of this decision.",
      adminNote: String(status.value.refundAdminNote || "").trim(),
    };
  } else if (rs === "rejected") {
    refundResultModal.value = {
      kind: "rejected",
      title: "Refund request rejected",
      body: "Your refund request has been rejected by the administrator.",
      adminNote: String(status.value.refundAdminNote || "").trim(),
    };
  }
}

function closeRefundResultModal() {
  const uid = String(me.value?.id || "").trim();
  if (uid && status.value) {
    const fp = refundResultFingerprint(status.value);
    if (fp) localStorage.setItem(`vip_refund_result_seen_${uid}`, fp);
  }
  refundResultModal.value = null;
}

async function refreshVipStatusOnly() {
  if (!me.value?.id) return;
  status.value = await api.get(`/vip/status/${me.value.id}`).then((r) => r.data);
  auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
  await nextTick();
  considerRefundResultModal();
}

async function load() {
  loading.value = true;
  try {
    me.value = await api.get("/users/me").then((r) => r.data);
    await refreshVipStatusOnly();
  } finally {
    loading.value = false;
  }
}

function openPaymentModal(plan) {
  pendingPlan.value = String(plan || "monthly");
  paymentError.value = "";
  paymentSuccess.value = "";
  paymentForm.areaCode = "+86";
  paymentForm.phoneNumber = "";
  paymentForm.paymentMethod = "";
  paymentForm.cardNumber = "";
  showPaymentFormModal.value = false;
  showPaymentModal.value = true;
}

function closePaymentModal(force = false) {
  if (paymentSubmitting.value && !force) return;
  showPaymentModal.value = false;
  showPaymentFormModal.value = false;
  pendingPlan.value = "";
  paymentError.value = "";
  paymentForm.areaCode = "+86";
  paymentForm.phoneNumber = "";
  paymentForm.paymentMethod = "";
  paymentForm.cardNumber = "";
}

function openPaymentFormModal() {
  paymentError.value = "";
  showPaymentModal.value = false;
  showPaymentFormModal.value = true;
}

function getPaymentValidationError() {
  const phoneDigits = String(paymentForm.phoneNumber || "").replace(/\D/g, "");
  if (!phoneDigits) return "Contact number is required.";
  if (paymentForm.areaCode === "+86" && phoneDigits.length !== 11) return "Phone number must be 11 digits for +86";
  if (paymentForm.areaCode === "+852" && phoneDigits.length !== 8) return "Phone number must be 8 digits for +852";
  if (!paymentForm.paymentMethod) return "Please select a payment method.";
  if (paymentForm.paymentMethod !== "card") return "";
  const cardDigits = String(paymentForm.cardNumber || "").replace(/\D/g, "");
  if (!cardDigits) return "Card number is required.";
  if (cardDigits.length !== 16) return "Card number must be 16 digits";
  return "";
}

async function confirmPayment() {
  if (!me.value?.id || !pendingPlan.value) return;
  paymentError.value = getPaymentValidationError();
  if (paymentError.value) return;
  paymentSubmitting.value = true;
  paymentError.value = "";
  try {
    status.value = await api.post("/vip/upgrade", { userId: me.value.id, vipPlan: pendingPlan.value }).then((r) => r.data);
    auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
    paymentSuccess.value = "Payment successful.";
    if (paymentSuccessTimer) window.clearTimeout(paymentSuccessTimer);
    paymentSuccessTimer = window.setTimeout(() => {
      paymentSuccess.value = "";
    }, 3000);
    closePaymentModal(true);
  } catch (error) {
    paymentError.value = error?.response?.data?.message || "Payment failed. Please try again.";
  } finally {
    paymentSubmitting.value = false;
  }
}

function openMembershipActionModal() {
  actionError.value = "";
  showActionConfirmModal.value = true;
}

function closeMembershipActionModal(force = false) {
  if (actionSubmitting.value && !force) return;
  showActionConfirmModal.value = false;
  actionError.value = "";
}

async function confirmMembershipAction() {
  if (!me.value?.id) return;
  actionSubmitting.value = true;
  actionError.value = "";
  try {
    status.value = await api.post("/vip/cancel", { userId: me.value.id }).then((r) => r.data);
    auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
    closeMembershipActionModal(true);
  } catch (error) {
    actionError.value = error?.response?.data?.message || "Failed to update VIP membership.";
  } finally {
    actionSubmitting.value = false;
  }
}

function openRefundRequestModal() {
  refundError.value = "";
  refundForm.reason = "";
  refundForm.note = "";
  showRefundRequestModal.value = true;
}

function closeRefundRequestModal(force = false) {
  if (refundSubmitting.value && !force) return;
  showRefundRequestModal.value = false;
  refundError.value = "";
}

async function submitRefundRequest() {
  const reason = String(refundForm.reason || "").trim();
  if (!reason) {
    refundError.value = "Reason for refund is required.";
    return;
  }
  if (!me.value?.id) return;
  refundSubmitting.value = true;
  refundError.value = "";
  refundSubmitBanner.value = false;
  if (refundSubmitBannerTimer) {
    window.clearTimeout(refundSubmitBannerTimer);
    refundSubmitBannerTimer = null;
  }
  try {
    status.value = await api
      .post("/vip/refund-request", {
        userId: me.value.id,
        reason,
        note: String(refundForm.note || "").trim(),
      })
      .then((r) => r.data);
    auth.setVipStatus(status.value?.vip_status ?? status.value?.isVip);
    closeRefundRequestModal(true);
    refundSubmitBanner.value = true;
    refundSubmitBannerTimer = window.setTimeout(() => {
      refundSubmitBanner.value = false;
      refundSubmitBannerTimer = null;
    }, 12000);
  } catch (error) {
    refundError.value = error?.response?.data?.message || "Failed to submit refund request.";
  } finally {
    refundSubmitting.value = false;
  }
}

onMounted(() => {
  load();
  refundPollTimer = window.setInterval(() => {
    if (me.value?.id && String(status.value?.refundStatus || "") === "pending") {
      refreshVipStatusOnly().catch(() => null);
    }
  }, 45000);
});

onBeforeUnmount(() => {
  if (refundPollTimer) window.clearInterval(refundPollTimer);
  if (refundSubmitBannerTimer) window.clearTimeout(refundSubmitBannerTimer);
});
</script>

<template>
  <AppNavbar />
  <main class="page">
    <h2 class="title">👑 VIP</h2>
    <section class="panel">
      <p v-if="loading" class="muted">Loading VIP status...</p>
      <template v-else>
        <p>
          Membership Status:
          <strong :class="isVipActive ? 'text-ok' : 'text-muted'">{{ isVipActive ? "VIP Active" : "Free User" }}</strong>
        </p>
        <p>Current Plan: <strong>{{ vipPlanLabel }}</strong></p>
        <p>VIP Since: <strong>{{ vipSinceLabel }}</strong></p>
        <p>Subscription Ends: <strong>{{ vipEndLabel }}</strong></p>
        <p class="hint">{{ statusHint }}</p>

        <div v-if="refundSubmitBanner" class="refund-banner" role="status">
          Refund request submitted. Waiting for admin review.
        </div>

        <div v-if="refundStatus !== 'none'" class="refund-panel panel-lite">
          <p class="refund-panel-label">Refund status</p>
          <p v-if="refundStatus === 'pending'" class="refund-status pending">Pending</p>
          <p v-if="refundStatus === 'pending'" class="hint refund-panel-hint">
            Your refund request has been submitted and is awaiting admin review.
          </p>
          <p v-if="refundStatus === 'approved'" class="refund-status approved">Approved</p>
          <p v-if="refundStatus === 'approved'" class="hint refund-panel-hint">
            Refund approved. Your VIP access has been removed. If you have billing questions, contact support.
          </p>
          <p v-if="refundStatus === 'approved' && status?.refundReviewedAt" class="muted small-line">
            Reviewed: {{ formatDate(status.refundReviewedAt) }}
          </p>
          <p v-if="refundStatus === 'approved' && status?.refundAdminNote" class="admin-note">
            <strong>Admin note:</strong> {{ status.refundAdminNote }}
          </p>
          <p v-if="refundStatus === 'rejected'" class="refund-status rejected">Rejected</p>
          <p v-if="refundStatus === 'rejected'" class="hint refund-panel-hint">Your refund request has been rejected.</p>
          <p v-if="refundStatus === 'rejected' && status?.refundReviewedAt" class="muted small-line">
            Reviewed: {{ formatDate(status.refundReviewedAt) }}
          </p>
          <p v-if="refundStatus === 'rejected' && status?.refundAdminNote" class="admin-note">
            <strong>Admin note:</strong> {{ status.refundAdminNote }}
          </p>
          <p v-if="refundStatus === 'rejected' && !canRequestRefund && isVipActive" class="hint refund-panel-hint">
            Previous request was rejected. You are outside the 7-day refund window, so a new refund request is not available.
          </p>
        </div>

        <p v-if="paymentSuccess" class="success-tip">{{ paymentSuccess }}</p>
      </template>

      <div class="grid grid-2 plans">
        <article class="card" :class="{ recommended: recommendedPlan === 'monthly' }">
          <h3>Monthly Plan</h3>
          <p class="muted">Flexible monthly billing for short-term goals and trial periods.</p>
          <button @click="openPaymentModal('monthly')">Upgrade to Monthly</button>
        </article>
        <article class="card" :class="{ recommended: recommendedPlan === 'yearly' }">
          <h3>Yearly Plan</h3>
          <p class="muted">Best long-term value with uninterrupted premium training access.</p>
          <button @click="openPaymentModal('yearly')">Upgrade to Yearly</button>
        </article>
      </div>

      <section class="compare panel-lite">
        <h3>Free vs VIP comparison</h3>
        <div class="compare-table">
          <div class="row head">
            <span>Feature</span>
            <span>Free</span>
            <span>VIP</span>
          </div>
          <div v-for="item in featureRows" :key="item.name" class="row">
            <span>{{ item.name }}</span>
            <span class="bad">{{ item.free }}</span>
            <span class="good">{{ item.vip }}</span>
          </div>
        </div>
      </section>

      <section class="compare panel-lite">
        <h3>VIP extra benefits</h3>
        <ul class="benefits">
          <li>Unlock premium courses directly from the Courses page.</li>
          <li>Use one-click enrollment to add full-term sessions into your schedule.</li>
          <li>Receive conflict reminders while keeping the option to continue.</li>
          <li>Keep access continuity with expiry warnings and renew anytime.</li>
        </ul>
      </section>

      <div v-if="canRequestRefund" class="cancel-box refund-actions">
        <button class="cancel-btn" type="button" @click="openRefundRequestModal">
          {{ refundStatus === "rejected" ? "Request Refund Again" : "Request Refund" }}
        </button>
      </div>
      <div v-if="hasPendingRefundRequest" class="cancel-box refund-actions">
        <button class="cancel-btn cancel-btn--disabled" type="button" disabled aria-disabled="true">Pending Review</button>
      </div>
      <div v-if="canCancelSubscription" class="cancel-box">
        <button class="cancel-btn" @click="openMembershipActionModal">Cancel Subscription</button>
      </div>
    </section>

    <div v-if="showPaymentModal && selectedPaymentPlan" class="modal-overlay" @click.self="closePaymentModal">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="Payment confirmation">
        <h3>Payment details</h3>
        <p><strong>Plan:</strong> {{ selectedPaymentPlan.label }}</p>
        <p><strong>Price:</strong> {{ selectedPaymentPlan.price }}</p>
        <p><strong>Billing cycle:</strong> {{ selectedPaymentPlan.billingCycle }}</p>
        <div class="benefits-box">
          <p><strong>Premium benefits:</strong></p>
          <ul>
            <li v-for="item in selectedPaymentPlan.benefits" :key="item">{{ item }}</li>
          </ul>
        </div>
        <p v-if="paymentError" class="error">{{ paymentError }}</p>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" @click="closePaymentModal">Cancel</button>
          <button type="button" @click="openPaymentFormModal">Payment</button>
        </div>
      </section>
    </div>

    <div v-if="showPaymentFormModal && selectedPaymentPlan" class="modal-overlay" @click.self="closePaymentModal">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="Complete your payment">
        <h3>Complete your payment</h3>
        <p><strong>Plan:</strong> {{ selectedPaymentPlan.label }}</p>
        <p><strong>Price:</strong> {{ selectedPaymentPlan.price }}</p>

        <div class="payment-form-block">
          <p><strong>Contact number</strong></p>
          <div class="contact-row">
            <select v-model="paymentForm.areaCode">
              <option value="+86">+86</option>
              <option value="+852">+852</option>
            </select>
            <input v-model.trim="paymentForm.phoneNumber" type="text" inputmode="numeric" placeholder="Phone number" />
          </div>
        </div>

        <div class="payment-form-block">
          <p><strong>Payment method</strong></p>
          <div class="payment-method-options">
            <label v-for="method in PAYMENT_METHODS" :key="method.key" class="method-option">
              <input v-model="paymentForm.paymentMethod" type="radio" name="payment-method" :value="method.key" />
              <span class="method-icon">{{ method.icon }}</span>
              <span>{{ method.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="paymentForm.paymentMethod === 'card'" class="payment-form-block">
          <label>
            Card number
            <input v-model.trim="paymentForm.cardNumber" type="text" inputmode="numeric" placeholder="1234 5678 9012 3456" />
          </label>
        </div>

        <p v-if="paymentError" class="error">{{ paymentError }}</p>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" @click="closePaymentModal">Cancel</button>
          <button type="button" :disabled="paymentSubmitting" @click="confirmPayment">
            {{ paymentSubmitting ? "Processing..." : "Pay Now" }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="showActionConfirmModal" class="modal-overlay" @click.self="closeMembershipActionModal">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="Membership action confirmation">
        <h3>Cancel subscription</h3>
        <p>Are you sure you want to cancel your VIP subscription?</p>
        <p v-if="actionError" class="error">{{ actionError }}</p>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" @click="closeMembershipActionModal">Cancel</button>
          <button type="button" :disabled="actionSubmitting" @click="confirmMembershipAction">
            {{ actionSubmitting ? "Updating..." : "Confirm Cancel" }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="refundResultModal" class="modal-overlay" @click.self="closeRefundResultModal">
      <section class="modal-card refund-result-card" role="dialog" aria-modal="true" aria-labelledby="refund-result-title">
        <h3 id="refund-result-title">{{ refundResultModal.title }}</h3>
        <p class="muted">{{ refundResultModal.body }}</p>
        <p v-if="refundResultModal.adminNote" class="admin-note-block">
          <strong>Additional note:</strong> {{ refundResultModal.adminNote }}
        </p>
        <div class="modal-actions">
          <button type="button" @click="closeRefundResultModal">OK</button>
        </div>
      </section>
    </div>

    <div v-if="showRefundRequestModal" class="modal-overlay" @click.self="closeRefundRequestModal">
      <section class="modal-card" role="dialog" aria-modal="true" aria-label="Refund request form">
        <h3>Refund request</h3>
        <p class="muted">Refund is available only within 7 days from the VIP since date.</p>
        <p class="muted">All refund requests are subject to admin approval.</p>
        <label class="payment-form-block">
          Reason for refund
          <textarea v-model.trim="refundForm.reason" rows="3" placeholder="Please describe the reason..." />
        </label>
        <label class="payment-form-block">
          Additional note (optional)
          <textarea v-model.trim="refundForm.note" rows="2" placeholder="Optional details" />
        </label>
        <p v-if="refundError" class="error">{{ refundError }}</p>
        <div class="modal-actions">
          <button type="button" class="cancel-btn" @click="closeRefundRequestModal">Cancel</button>
          <button type="button" :disabled="refundSubmitting" @click="submitRefundRequest">
            {{ refundSubmitting ? "Submitting..." : "Submit Refund Request" }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.plans { margin-top: 14px; }
.plans.grid {
  align-items: stretch;
}
.plans .card + .card {
  margin-top: 0;
}
.plans .card {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.plans .card h3 {
  margin-top: 0;
}
.plans .card p.muted {
  min-height: 44px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plans .card button {
  margin-top: auto;
  align-self: flex-start;
}
.recommended {
  border: 1px solid #9ad8d3;
  box-shadow: 0 8px 18px rgba(49, 104, 121, 0.12);
}
.panel-lite {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #d7e7e6;
  border-radius: 12px;
  background: #fbfefd;
}
.compare-table {
  display: grid;
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: 10px;
  align-items: center;
  font-size: 14px;
}
.row.head {
  font-weight: 700;
  color: #2f4858;
}
.bad { color: #8f2d2d; }
.good { color: #117a52; }
.benefits {
  margin: 8px 0 0;
  padding-left: 18px;
}
.hint {
  margin-top: 4px;
  color: #486170;
  font-size: 13px;
}
.success-tip {
  margin-top: 8px;
  color: #117a52;
  font-weight: 600;
}
.refund-status {
  margin-top: 8px;
  font-weight: 700;
}
.refund-status.pending {
  color: #9a6a00;
}
.refund-status.approved {
  color: #117a52;
}
.refund-status.rejected {
  color: #8f2d2d;
}
.refund-panel {
  margin-top: 12px;
}
.refund-panel-label {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #486170;
}
.refund-panel-hint {
  margin-top: 6px;
}
.small-line {
  margin: 6px 0 0;
  font-size: 13px;
}
.admin-note {
  margin: 8px 0 0;
  font-size: 13px;
  color: #2f4858;
  line-height: 1.45;
}
.admin-note-block {
  margin: 10px 0 0;
  padding: 10px;
  border-radius: 10px;
  background: #f7f8fb;
  border: 1px solid #e2e8f0;
  font-size: 13px;
  color: #2f4858;
  line-height: 1.45;
}
.refund-banner {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #c8e0da;
  background: #eef8f4;
  color: #1f5c4a;
  font-weight: 600;
  font-size: 14px;
}
.refund-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.cancel-btn--disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.text-ok { color: #117a52; }
.text-muted { color: #486170; }
.cancel-box { margin-top: 14px; display: flex; justify-content: flex-end; }
.cancel-btn {
  border: 1px solid #e5bcbc;
  background: #fff4f4;
  color: #8f2d2d;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.35);
  padding: 16px;
}
.modal-card {
  width: min(100%, 460px);
  border-radius: 12px;
  background: #fff;
  border: 1px solid #d7e7e6;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  padding: 16px;
}
.modal-card h3 {
  margin-top: 0;
  margin-bottom: 10px;
}
.benefits-box {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: #f7fbfa;
  border: 1px solid #e1eeec;
}
.benefits-box p {
  margin: 0 0 6px;
}
.benefits-box ul {
  margin: 0;
  padding-left: 18px;
}
.modal-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.payment-form-block {
  margin-top: 12px;
}
.payment-form-block p {
  margin: 0 0 8px;
}
.payment-method-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.method-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid #d7e7e6;
  border-radius: 8px;
  background: #fbfefd;
  font-size: 13px;
}
.method-icon {
  font-size: 14px;
}
.payment-form-block label {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: #2f4858;
}
.payment-form-block input,
.payment-form-block select,
.payment-form-block textarea {
  border: 1px solid #d7e7e6;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
}
.contact-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
}
</style>

