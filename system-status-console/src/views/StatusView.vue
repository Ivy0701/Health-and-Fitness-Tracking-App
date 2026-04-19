<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import api from "../services/api";
import { clearAdminSession, getAdminSession } from "../services/adminAuth";

const router = useRouter();
const loading = ref(true);
const error = ref("");
const payload = ref(null);
const refundActionLoadingId = ref("");
const refundActionError = ref("");
const refundRejectModalOpen = ref(false);
const refundRejectUserId = ref("");
const refundRejectNote = ref("");
const forumRows = ref([]);
const forumLoading = ref(false);
const forumError = ref("");
const forumActionLoadingId = ref("");
const forumNotice = ref("");
const warningModalOpen = ref(false);
const warningTargetPost = ref(null);
const warningMessageInput = ref("");
const viewPostModalOpen = ref(false);
const viewPostTarget = ref(null);
const removePostModalOpen = ref(false);
const removePostTarget = ref(null);
const removalReasonInput = ref("");

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString("en-US") : "0";
}

const users = computed(() => payload.value?.users || {});
const vip = computed(() => payload.value?.vip || {});
const refundRequests = computed(() => payload.value?.refundRequests || {});
const catalog = computed(() => payload.value?.catalog || {});
const courseEnrollments = computed(() => payload.value?.courseEnrollments || {});
const featureAdoption = computed(() => payload.value?.featureAdoption || {});
const featureUsage = computed(() => payload.value?.featureUsage || {});
const forumOverview = computed(() => payload.value?.forum || payload.value?.community || {});
const systemRuntime = computed(() => payload.value?.systemRuntime || {});
const workoutStatusBreakdown = computed(() => payload.value?.workoutStatusBreakdown || {});
const usersPreview12 = computed(() => users.value.preview12 || []);
const refundRows = computed(() => refundRequests.value.rows || []);
const adminSession = computed(() => getAdminSession());
const warningTemplates = [
  "This post may contain inaccurate information. Please read with caution.",
  "This nutrition advice is not verified.",
  "This fitness suggestion should be interpreted with caution.",
];

function formatDateTime(value) {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

const uptimeText = computed(() => {
  const s = Number(systemRuntime.value.processUptimeSeconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
});

const adoptionRows = computed(() => [
  { label: "Users with at least one workout log", value: n(featureAdoption.value.distinctUsersWithWorkoutLog) },
  { label: "Users with at least one diet entry", value: n(featureAdoption.value.distinctUsersWithDiet) },
  { label: "Users with at least one schedule item", value: n(featureAdoption.value.distinctUsersWithSchedule) },
  { label: "Users who created a workout plan", value: n(featureAdoption.value.distinctUsersWithWorkoutPlan) },
  { label: "Users with workout daily check-in data", value: n(featureAdoption.value.distinctUsersWithWorkoutDaily) },
  { label: "Users with an active or completed course enrollment", value: n(featureAdoption.value.distinctUsersWithCourseEnrollment) },
  { label: "Users with at least one visible forum post", value: n(featureAdoption.value.distinctUsersWithForumPost) },
  { label: "Users with at least one favorite", value: n(featureAdoption.value.distinctUsersWithFavorite) },
  { label: "Users with a health / BMI record", value: n(featureAdoption.value.distinctUsersWithHealthRecord) },
]);

const usageRows = computed(() => [
  { label: "Workout plans created (total rows)", value: n(featureUsage.value.workoutPlansCreated) },
  { label: "Completed workout tasks (plan + manual schedule, all-time)", value: n(featureUsage.value.workoutTasksCompleted) },
  { label: "Completed manual workout schedule tasks", value: n(featureUsage.value.completedManualWorkoutScheduleTasks) },
  { label: "Diet entries (total rows, all-time)", value: n(featureUsage.value.dietEntries) },
  { label: "Schedule items (current effective rows, today+future)", value: n(featureUsage.value.scheduleItems) },
  { label: "Course enrollment rows (active + completed)", value: n(featureUsage.value.courseEnrollments) },
  { label: "Course daily progress rows completed (course card days)", value: n(featureUsage.value.completedCourseDays) },
  { label: "Course sub-exercises completed", value: n(featureUsage.value.completedCourseExercises) },
  { label: "Course sub-exercises total", value: n(featureUsage.value.totalCourseExercises) },
  { label: "Favorites saved (total rows)", value: n(featureUsage.value.favoritesSaved) },
  { label: "Calories burned logged (Workout, includes course completion, all-time)", value: n(featureUsage.value.totalCaloriesBurned) },
  { label: "Calories consumed logged (Diet, all-time)", value: n(featureUsage.value.totalCaloriesConsumed) },
]);

const workoutStatusRows = computed(() => {
  const s = workoutStatusBreakdown.value || {};
  return [
    { label: "not_started", value: n(s.not_started) },
    { label: "in_progress", value: n(s.in_progress) },
    { label: "paused", value: n(s.paused) },
    { label: "completed", value: n(s.completed) },
    { label: "missed", value: n(s.missed) },
    { label: "scheduled", value: n(s.scheduled) },
  ];
});

const enrollStatus = computed(() => courseEnrollments.value.byStatus || {});

const topCourses = computed(() => courseEnrollments.value.topByEnrollments || []);

async function loadSystemStatus() {
  try {
    refundActionError.value = "";
    const res = await api.get("/dashboard/system-status");
    payload.value = res.data;
  } catch (err) {
    const status = err?.response?.status;
    const bodyMsg = err?.response?.data?.message;
    if (!err?.response) {
      error.value =
        "Cannot reach the API. Start the backend, restart this dev server, and ensure VITE_BACKEND_ORIGIN in .env.development matches the backend port (Vite proxies /api in development).";
    } else if (status === 401) {
      error.value =
        bodyMsg ||
        "Unauthorized (401). Set SYSTEM_STATUS_PUBLIC=true in backend .env, or avoid NODE_ENV=production locally.";
    } else {
      error.value = bodyMsg || `Request failed (${status || "error"}).`;
    }
  } finally {
    loading.value = false;
  }
}

async function loadForumModeration() {
  forumLoading.value = true;
  forumError.value = "";
  try {
    const res = await api.get("/dashboard/forum-moderation");
    forumRows.value = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    forumError.value = err?.response?.data?.message || "Failed to load forum moderation data.";
  } finally {
    forumLoading.value = false;
  }
}

async function approveRefund(userId) {
  if (!userId || refundActionLoadingId.value) return;
  refundActionLoadingId.value = `approve:${userId}`;
  refundActionError.value = "";
  try {
    await api.post(`/dashboard/refund-requests/${userId}/approve`);
    await loadSystemStatus();
  } catch (err) {
    refundActionError.value = err?.response?.data?.message || "Failed to approve refund request.";
  } finally {
    refundActionLoadingId.value = "";
  }
}

function openRefundRejectModal(userId) {
  if (!userId || refundActionLoadingId.value) return;
  refundRejectUserId.value = String(userId);
  refundRejectNote.value = "";
  refundRejectModalOpen.value = true;
}

function closeRefundRejectModal() {
  refundRejectModalOpen.value = false;
  refundRejectUserId.value = "";
  refundRejectNote.value = "";
}

async function submitRefundReject() {
  const userId = String(refundRejectUserId.value || "").trim();
  if (!userId || refundActionLoadingId.value) return;
  refundActionLoadingId.value = `reject:${userId}`;
  refundActionError.value = "";
  try {
    await api.post(`/dashboard/refund-requests/${userId}/reject`, {
      adminNote: String(refundRejectNote.value || "").trim(),
    });
    closeRefundRejectModal();
    await loadSystemStatus();
  } catch (err) {
    refundActionError.value = err?.response?.data?.message || "Failed to reject refund request.";
  } finally {
    refundActionLoadingId.value = "";
  }
}

function logout() {
  clearAdminSession();
  router.replace("/login");
}

function openViewPost(row) {
  viewPostTarget.value = row || null;
  viewPostModalOpen.value = true;
}

function closeViewPost() {
  viewPostModalOpen.value = false;
  viewPostTarget.value = null;
}

function openWarningModal(row) {
  warningTargetPost.value = row || null;
  warningMessageInput.value = row?.warningMessage || warningTemplates[0];
  warningModalOpen.value = true;
}

function closeWarningModal() {
  warningModalOpen.value = false;
  warningTargetPost.value = null;
  warningMessageInput.value = "";
}

async function submitWarning() {
  const postId = String(warningTargetPost.value?.id || "").trim();
  const warningMessage = String(warningMessageInput.value || "").trim();
  if (!postId || !warningMessage || forumActionLoadingId.value) return;
  forumActionLoadingId.value = `warn:${postId}`;
  forumNotice.value = "";
  try {
    await api.post(`/dashboard/forum-moderation/${postId}/warn`, { warningMessage });
    closeWarningModal();
    await Promise.all([loadForumModeration(), loadSystemStatus()]);
    forumNotice.value = "Warning added successfully.";
  } catch (err) {
    forumError.value = err?.response?.data?.message || "Failed to add warning.";
  } finally {
    forumActionLoadingId.value = "";
  }
}

async function removeWarning(row) {
  const postId = String(row?.id || "").trim();
  if (!postId || forumActionLoadingId.value) return;
  forumActionLoadingId.value = `unwarn:${postId}`;
  forumNotice.value = "";
  try {
    await api.post(`/dashboard/forum-moderation/${postId}/remove-warning`);
    await Promise.all([loadForumModeration(), loadSystemStatus()]);
    forumNotice.value = "Warning removed.";
  } catch (err) {
    forumError.value = err?.response?.data?.message || "Failed to remove warning.";
  } finally {
    forumActionLoadingId.value = "";
  }
}

function openRemovePostModal(row) {
  if (!row || String(row?.status || "") === "removed" || forumActionLoadingId.value) return;
  removePostTarget.value = row;
  removalReasonInput.value = "";
  removePostModalOpen.value = true;
}

function closeRemovePostModal() {
  removePostModalOpen.value = false;
  removePostTarget.value = null;
  removalReasonInput.value = "";
}

async function submitRemovePost() {
  const postId = String(removePostTarget.value?.id || "").trim();
  const reason = String(removalReasonInput.value || "").trim();
  if (!postId || !reason || forumActionLoadingId.value) return;
  forumActionLoadingId.value = `delete:${postId}`;
  forumNotice.value = "";
  forumError.value = "";
  try {
    await api.delete(`/dashboard/forum-moderation/${postId}`, { data: { removalReason: reason } });
    closeRemovePostModal();
    await Promise.all([loadForumModeration(), loadSystemStatus()]);
    forumNotice.value = "Post removed and author notified.";
  } catch (err) {
    forumError.value = err?.response?.data?.message || "Failed to delete post.";
  } finally {
    forumActionLoadingId.value = "";
  }
}

onMounted(async () => {
  await Promise.all([loadSystemStatus(), loadForumModeration()]);
});
</script>

<template>
  <header class="dev-bar">
    <span class="title">System status (internal)</span>
    <div class="bar-actions">
      <span class="sub">{{ adminSession?.displayName || adminSession?.email || "Admin" }}</span>
      <button type="button" class="logout-btn" @click="logout">Logout</button>
    </div>
  </header>
  <main class="status-wrap">
    <section class="shell">
      <header class="hero">
        <h1>Platform operations dashboard</h1>
        <p>User growth, VIP conversion, feature adoption, course enrollments, forum engagement, and system health</p>
      </header>

      <div v-if="loading" class="state-block">Loading…</div>
      <div v-else-if="error" class="state-block error">{{ error }}</div>

      <template v-else>
        <section class="section">
          <h2 class="section-title">Users</h2>
          <div class="kpi-grid">
            <div class="kpi">
              <span class="kpi-label">Registered users</span>
              <strong class="kpi-value">{{ n(users.totalRegistered) }}</strong>
            </div>
            <div class="kpi kpi-accent">
              <span class="kpi-label">VIP users</span>
              <strong class="kpi-value">{{ n(vip.totalVipUsers) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">Assessment completed</span>
              <strong class="kpi-value">{{ n(users.assessmentCompleted) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">New registrations (7 days)</span>
              <strong class="kpi-value">{{ n(users.registeredLast7Days) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">New registrations (30 days)</span>
              <strong class="kpi-value">{{ n(users.registeredLast30Days) }}</strong>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Registered users (latest 12)</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Registered at</th>
                  <th>VIP</th>
                  <th>VIP plan</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(u, i) in usersPreview12" :key="u.id || i">
                  <td>{{ i + 1 }}</td>
                  <td>{{ u.username || "—" }}</td>
                  <td class="mono">{{ u.email || "—" }}</td>
                  <td class="mono small">{{ u.createdAt || "—" }}</td>
                  <td>
                    <span v-if="u.isVip" class="badge badge-premium">Yes</span>
                    <span v-else class="badge">No</span>
                  </td>
                  <td><span class="badge">{{ u.vipPlan || "none" }}</span></td>
                </tr>
                <tr v-if="!usersPreview12.length">
                  <td colspan="6" class="empty">No users found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">VIP breakdown</h2>
          <div class="kpi-grid kpi-grid-4">
            <div class="kpi">
              <span class="kpi-label">Monthly plan (<code>monthly</code>)</span>
              <strong class="kpi-value">{{ n(vip.monthlyPlanUsers) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">Yearly plan (<code>yearly</code>)</span>
              <strong class="kpi-value">{{ n(vip.yearlyPlanUsers) }}</strong>
            </div>
            <div class="kpi kpi-warn">
              <span class="kpi-label">VIP flag but <code>vipPlan = none</code></span>
              <strong class="kpi-value">{{ n(vip.vipButPlanNone) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">Expired VIP flags (plan exists, end date passed)</span>
              <strong class="kpi-value">{{ n(vip.expiredVipUsers) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">Refund requests pending review</span>
              <strong class="kpi-value">{{ n(vip.refundPendingRequests) }}</strong>
            </div>
            <div class="kpi">
              <span class="kpi-label">Auto-cleaned VIP flag/plan mismatch</span>
              <strong class="kpi-value">{{ n(vip.autoCleanedVipFlagPlanMismatch) }}</strong>
            </div>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">VIP refund management</h2>
          <p class="hint">Review pending requests and decide whether to approve or reject.</p>
          <p v-if="refundActionError" class="state-block error">{{ refundActionError }}</p>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>VIP plan</th>
                  <th>VIP since</th>
                  <th>Subscription ends</th>
                  <th>Refund reason</th>
                  <th>Additional note</th>
                  <th>Requested at</th>
                  <th>Status</th>
                  <th>Reviewed at</th>
                  <th>Reviewed by</th>
                  <th>Admin note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in refundRows" :key="row.userId">
                  <td>
                    <div>{{ row.username || "—" }}</div>
                    <div class="mono small">{{ row.userId || "—" }}</div>
                    <div class="mono small">{{ row.email || "—" }}</div>
                  </td>
                  <td><span class="badge">{{ row.vipPlan || "none" }}</span></td>
                  <td class="mono small">{{ formatDateTime(row.vipSince) }}</td>
                  <td class="mono small">{{ formatDateTime(row.subscriptionEnds) }}</td>
                  <td>{{ row.refundReason || "—" }}</td>
                  <td>{{ row.refundNote || "—" }}</td>
                  <td class="mono small">{{ formatDateTime(row.refundRequestedAt) }}</td>
                  <td>
                    <span class="badge" :class="{ 'badge-pending': row.refundStatus === 'pending', 'badge-ok': row.refundStatus === 'approved', 'badge-bad': row.refundStatus === 'rejected' }">
                      {{ row.refundStatus || "none" }}
                    </span>
                  </td>
                  <td class="mono small">{{ formatDateTime(row.refundReviewedAt) }}</td>
                  <td class="mono small">{{ row.refundReviewedBy || "—" }}</td>
                  <td>{{ row.refundAdminNote || "—" }}</td>
                  <td>
                    <div class="action-row">
                      <button
                        v-if="row.refundStatus === 'pending'"
                        type="button"
                        class="btn-ok"
                        :disabled="Boolean(refundActionLoadingId)"
                        @click="approveRefund(row.userId)"
                      >
                        {{ refundActionLoadingId === `approve:${row.userId}` ? "Approving..." : "Approve" }}
                      </button>
                      <button
                        v-if="row.refundStatus === 'pending'"
                        type="button"
                        class="btn-bad"
                        :disabled="Boolean(refundActionLoadingId)"
                        @click="openRefundRejectModal(row.userId)"
                      >
                        Reject…
                      </button>
                      <span v-if="row.refundStatus !== 'pending'" class="mono small">—</span>
                    </div>
                  </td>
                </tr>
                <tr v-if="!refundRows.length">
                  <td colspan="12" class="empty">No refund requests found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section two-col">
          <div class="card">
            <h2 class="section-title">Course catalog</h2>
            <ul class="rows">
              <li><span>Courses in catalog</span><strong>{{ n(catalog.totalCourses) }}</strong></li>
              <li><span>Premium courses</span><strong>{{ n(catalog.premiumCourses) }}</strong></li>
              <li><span>Enrollment rows (all statuses)</span><strong>{{ n(courseEnrollments.allStatusRecords) }}</strong></li>
              <li><span>Avg enrollments per course</span><strong>{{ courseEnrollments.avgEnrollmentsPerCourse ?? "—" }}</strong></li>
            </ul>
          </div>
          <div class="card">
            <h2 class="section-title">Enrollment status</h2>
            <ul class="rows">
              <li><span>Active</span><strong>{{ n(enrollStatus.active) }}</strong></li>
              <li><span>Completed</span><strong>{{ n(enrollStatus.completed) }}</strong></li>
              <li><span>Cancelled</span><strong>{{ n(enrollStatus.cancelled) }}</strong></li>
            </ul>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Top courses by enrollment (10)</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Course</th>
                  <th>Enrollments</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in topCourses" :key="row.courseId || i">
                  <td>{{ i + 1 }}</td>
                  <td>{{ row.title }}</td>
                  <td>{{ n(row.enrollments) }}</td>
                  <td>
                    <span v-if="row.isPremium" class="badge badge-premium">Premium</span>
                    <span v-else class="badge">Standard</span>
                  </td>
                </tr>
                <tr v-if="!topCourses.length">
                  <td colspan="4" class="empty">No enrollment data yet</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Feature adoption (distinct users)</h2>
          <p class="hint">Counts users with <strong>at least one</strong> related row — not clicks or sessions</p>
          <ul class="dense-grid">
            <li v-for="row in adoptionRows" :key="row.label">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </li>
          </ul>
        </section>

        <section class="section">
          <h2 class="section-title">Platform totals (row counts)</h2>
          <ul class="dense-grid">
            <li v-for="row in usageRows" :key="row.label">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </li>
          </ul>
        </section>

        <section class="section">
          <h2 class="section-title">Workout status breakdown</h2>
          <p class="hint">
            Status normalization uses current workout rules:
            <code>not_started / in_progress / paused / completed / missed / scheduled</code>, based on current workout schedule
            items with persisted workout task status.
          </p>
          <ul class="dense-grid">
            <li v-for="row in workoutStatusRows" :key="row.label">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </li>
          </ul>
        </section>

        <section class="section two-col">
          <div class="card">
            <h2 class="section-title">Forum Overview</h2>
            <p class="hint">
              Visible metrics match the user Forum feed (<code>GET /forum/posts</code>). The moderation table lists the same
              live posts (plus <code>removed</code> rows for review), excluding legacy seed titles no longer shown in the app.
            </p>
            <ul class="rows">
              <li><span>Distinct post authors (visible posts)</span><strong>{{ n(forumOverview.distinctAuthors) }}</strong></li>
              <li>
                <span>Visible posts (user Forum feed)</span><strong>{{ n(forumOverview.postsVisible ?? forumOverview.postsTotal) }}</strong>
              </li>
              <li><span>Posts today (visible)</span><strong>{{ n(forumOverview.postsToday) }}</strong></li>
              <li><span>Removed posts (moderation)</span><strong>{{ n(forumOverview.postsRemoved) }}</strong></li>
              <li><span>Total likes (visible posts)</span><strong>{{ n(forumOverview.likesTotal) }}</strong></li>
              <li><span>Total comments (visible posts)</span><strong>{{ n(forumOverview.commentsTotal) }}</strong></li>
              <li><span>Interactions (likes + comments, visible)</span><strong>{{ n(forumOverview.totalInteractions) }}</strong></li>
            </ul>
          </div>
          <div class="card">
            <h2 class="section-title">Runtime</h2>
            <ul class="rows">
              <li><span>API</span><strong>{{ systemRuntime.apiStatus || "—" }}</strong></li>
              <li><span>Database</span><strong>{{ systemRuntime.databaseStatus || "—" }}</strong></li>
              <li><span>Process uptime</span><strong>{{ uptimeText }}</strong></li>
              <li><span>Server time</span><strong class="mono">{{ systemRuntime.serverTime || "—" }}</strong></li>
              <li><span>Latest platform activity</span><strong class="mono small">{{ systemRuntime.latestPlatformActivityAt || "—" }}</strong></li>
              <li><span>Stats date</span><strong>{{ systemRuntime.statsDate || "—" }}</strong></li>
            </ul>
          </div>
        </section>

        <section class="section">
          <h2 class="section-title">Forum Moderation</h2>
          <p class="hint">Review recent posts, add warnings, remove warnings, or delete posts.</p>
          <p v-if="forumNotice" class="state-block">{{ forumNotice }}</p>
          <p v-if="forumError" class="state-block error">{{ forumError }}</p>
          <div v-if="forumLoading" class="state-block">Loading forum posts…</div>
          <div v-else class="table-wrap forum-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Post title</th>
                  <th>Author</th>
                  <th>Created at</th>
                  <th>Tags</th>
                  <th>Likes</th>
                  <th>Comments</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in forumRows" :key="row.id">
                  <td>{{ row.title || "Untitled" }}</td>
                  <td>{{ row.authorName || "—" }}</td>
                  <td class="mono small">{{ formatDateTime(row.createdAt) }}</td>
                  <td>
                    <span v-if="row.tags?.length">{{ row.tags.join(", ") }}</span>
                    <span v-else>—</span>
                  </td>
                  <td>{{ n(row.likeCount) }}</td>
                  <td>{{ n(row.commentCount) }}</td>
                  <td>
                    <span class="badge" :class="{ 'badge-pending': row.status === 'warned', 'badge-bad': row.status === 'removed' }">
                      {{ row.status || "normal" }}
                    </span>
                  </td>
                  <td>
                    <div class="action-row action-row-wrap">
                      <button type="button" class="btn-view" @click="openViewPost(row)">View</button>
                      <button
                        type="button"
                        class="btn-ok"
                        :disabled="Boolean(forumActionLoadingId) || row.status === 'removed'"
                        @click="openWarningModal(row)"
                      >
                        Add Warning
                      </button>
                      <button
                        v-if="row.status === 'warned'"
                        type="button"
                        class="btn-plain"
                        :disabled="Boolean(forumActionLoadingId)"
                        @click="removeWarning(row)"
                      >
                        Remove Warning
                      </button>
                      <button
                        type="button"
                        class="btn-bad"
                        :disabled="Boolean(forumActionLoadingId) || row.status === 'removed'"
                        @click="openRemovePostModal(row)"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!forumRows.length">
                  <td colspan="8" class="empty">No forum posts found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>
  </main>

  <div v-if="refundRejectModalOpen" class="modal-backdrop" @click.self="closeRefundRejectModal">
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="Reject refund request">
      <h3>Reject refund request</h3>
      <p class="hint">Optional note for the user (shown on their VIP page).</p>
      <textarea v-model="refundRejectNote" rows="4" placeholder="Reason for rejection (optional)…" />
      <div class="action-row modal-actions">
        <button type="button" class="btn-plain" @click="closeRefundRejectModal" :disabled="Boolean(refundActionLoadingId)">Cancel</button>
        <button
          type="button"
          class="btn-bad"
          :disabled="Boolean(refundActionLoadingId)"
          @click="submitRefundReject"
        >
          {{ refundActionLoadingId && String(refundActionLoadingId).startsWith("reject:") ? "Rejecting..." : "Confirm reject" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="warningModalOpen" class="modal-backdrop" @click.self="closeWarningModal">
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="Add warning">
      <h3>Add Warning</h3>
      <p class="hint">Choose a template or edit your own message.</p>
      <div class="template-row">
        <button
          v-for="tpl in warningTemplates"
          :key="tpl"
          type="button"
          class="btn-plain"
          @click="warningMessageInput = tpl"
        >
          {{ tpl }}
        </button>
      </div>
      <textarea v-model="warningMessageInput" rows="4" placeholder="Enter warning message..." />
      <div class="action-row modal-actions">
        <button type="button" class="btn-plain" @click="closeWarningModal">Cancel</button>
        <button type="button" class="btn-ok" :disabled="!warningMessageInput.trim() || Boolean(forumActionLoadingId)" @click="submitWarning">
          Save Warning
        </button>
      </div>
    </section>
  </div>

  <div v-if="removePostModalOpen" class="modal-backdrop" @click.self="closeRemovePostModal">
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="Remove post">
      <h3>Remove post</h3>
      <p class="hint">
        This will hide the post from the forum and notify the author. A removal reason is required (shown to the author).
      </p>
      <p class="mono small">
        <strong>{{ removePostTarget?.title || "Untitled" }}</strong>
        · {{ removePostTarget?.authorName || "—" }}
      </p>
      <label class="field-label">
        Removal reason
        <textarea v-model="removalReasonInput" rows="4" placeholder="Explain why this post was removed…" />
      </label>
      <div class="action-row modal-actions">
        <button type="button" class="btn-plain" @click="closeRemovePostModal" :disabled="Boolean(forumActionLoadingId)">
          Cancel
        </button>
        <button
          type="button"
          class="btn-bad"
          :disabled="!removalReasonInput.trim() || Boolean(forumActionLoadingId)"
          @click="submitRemovePost"
        >
          {{
            forumActionLoadingId && String(forumActionLoadingId).startsWith("delete:")
              ? "Removing…"
              : "Confirm removal"
          }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="viewPostModalOpen" class="modal-backdrop" @click.self="closeViewPost">
    <section class="modal-card" role="dialog" aria-modal="true" aria-label="View post">
      <h3>{{ viewPostTarget?.title || "Post" }}</h3>
      <p class="mono small">Author: {{ viewPostTarget?.authorName || "—" }} · {{ formatDateTime(viewPostTarget?.createdAt) }}</p>
      <p v-if="viewPostTarget?.status === 'warned' && viewPostTarget?.warningMessage" class="warn-text">
        Warning: {{ viewPostTarget.warningMessage }}
      </p>
      <p v-if="viewPostTarget?.status === 'removed' && viewPostTarget?.removalReason" class="warn-text removal-text">
        Removal reason: {{ viewPostTarget.removalReason }}
      </p>
      <p class="post-body">{{ viewPostTarget?.content || "No content." }}</p>
      <div class="action-row modal-actions">
        <button type="button" class="btn-plain" @click="closeViewPost">Close</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dev-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 12px 20px;
  background: linear-gradient(90deg, #1a3a44 0%, #2f4858 100%);
  color: #fff;
  border-bottom: 2px solid #0f2429;
}

.dev-bar .title {
  font-weight: 700;
  font-size: 1rem;
}

.dev-bar .sub {
  font-size: 0.8rem;
  opacity: 0.85;
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logout-btn {
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 8px;
  background: transparent;
  color: #fff;
  padding: 5px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.status-wrap {
  min-height: calc(100vh - 52px);
  padding: 20px 16px 48px;
  background: linear-gradient(165deg, #e8f5ef 0%, #f0faf7 35%, #ffffff 70%);
}

.shell {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.hero {
  border-radius: 20px;
  padding: 28px 20px;
  text-align: center;
  color: #fff;
  background: linear-gradient(135deg, #2d6a4f 0%, #40916c 40%, #52b788 70%, #74c69d 100%);
  box-shadow: 0 16px 40px rgba(45, 106, 79, 0.25);
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.35rem, 3.5vw, 1.85rem);
  letter-spacing: 0.02em;
}

.hero p {
  margin: 10px 0 0;
  opacity: 0.95;
  font-size: 0.95rem;
}

.section {
  background: #fff;
  border-radius: 16px;
  padding: 20px 18px 22px;
  border: 1px solid rgba(64, 145, 108, 0.25);
  box-shadow: 0 4px 20px rgba(15, 36, 41, 0.06);
}

.section-title {
  margin: 0 0 14px;
  font-size: 1.1rem;
  color: #1b4332;
  font-weight: 700;
  padding-bottom: 8px;
  border-bottom: 2px solid #b7e4c7;
}

.hint {
  margin: -6px 0 14px;
  font-size: 0.8rem;
  color: #52796f;
  line-height: 1.45;
}

.hint code {
  font-size: 0.78em;
  background: #f1faee;
  padding: 1px 5px;
  border-radius: 4px;
}

.small {
  font-size: 0.78rem;
}

.recovered-note {
  margin-top: 3px;
  color: #52796f;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.kpi-grid-4 {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.kpi {
  border-radius: 12px;
  padding: 14px 14px 16px;
  background: linear-gradient(160deg, #f8fffa 0%, #ecf8f1 100%);
  border: 1px solid #ccebd5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kpi-accent {
  background: linear-gradient(160deg, #fff9e6 0%, #fff3cc 100%);
  border-color: #e6c200;
}

.kpi-warn {
  background: linear-gradient(160deg, #fff5f5 0%, #ffe8e8 100%);
  border-color: #f0b4b4;
}

.kpi-label {
  font-size: 0.78rem;
  color: #406056;
  line-height: 1.35;
}

.kpi-value {
  font-size: 1.45rem;
  color: #1b4332;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 0;
  background: transparent;
  border: none;
  box-shadow: none;
}

.two-col .card {
  background: #fff;
  border-radius: 16px;
  padding: 20px 18px 22px;
  border: 1px solid rgba(64, 145, 108, 0.25);
  box-shadow: 0 4px 20px rgba(15, 36, 41, 0.06);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rows li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fcf9;
  border: 1px solid #e6f2ea;
  font-size: 0.9rem;
  color: #355f52;
}

.rows strong {
  color: #1b4332;
  font-weight: 700;
}

.dense-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.dense-grid li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fcf9;
  border: 1px solid #e6f2ea;
  font-size: 0.86rem;
  color: #355f52;
}

.dense-grid strong {
  color: #1b4332;
  font-weight: 700;
  flex-shrink: 0;
}

.table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid #ccebd5;
}

.forum-table-wrap {
  max-height: 420px;
  overflow-y: auto;
  overflow-x: auto;
}

.forum-table-wrap thead th {
  position: sticky;
  top: 0;
  z-index: 1;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #e6f2ea;
}

.data-table th {
  background: #ecf8f1;
  color: #1b4332;
  font-weight: 700;
}

.data-table tr:last-child td {
  border-bottom: none;
}

.data-table .empty {
  text-align: center;
  color: #74a08f;
  padding: 20px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: #e8f0ec;
  color: #406056;
}

.badge-premium {
  background: linear-gradient(90deg, #fef3c7, #fde68a);
  color: #78350f;
  font-weight: 600;
}

.badge-pending {
  background: #fff3cd;
  color: #8a6300;
}

.badge-ok {
  background: #d9f7e8;
  color: #0f6b48;
}

.badge-bad {
  background: #ffe3e3;
  color: #9b1c1c;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  word-break: break-all;
}

.mono.small {
  font-size: 0.75rem;
}

.state-block {
  border-radius: 14px;
  border: 1px solid #ccebd5;
  padding: 18px;
  background: #fff;
  color: #1b4332;
}

.state-block.error {
  border-color: #e8a0a0;
  color: #9b1c1c;
}

.action-row {
  display: flex;
  gap: 6px;
}

.action-row-wrap {
  flex-wrap: wrap;
}

.btn-view,
.btn-plain,
.btn-ok,
.btn-bad {
  border-radius: 8px;
  border: 1px solid #ccebd5;
  padding: 4px 8px;
  font-size: 0.76rem;
  cursor: pointer;
}

.btn-view {
  background: #eef5ff;
  color: #1c4d8f;
  border-color: #cfe0fb;
}

.btn-plain {
  background: #f4f7f6;
  color: #355f52;
}

.btn-ok {
  background: #e8f8ef;
  color: #1b6f4f;
}

.btn-bad {
  background: #fff1f1;
  color: #9b1c1c;
  border-color: #f2c2c2;
}

.btn-ok:disabled,
.btn-bad:disabled,
.btn-view:disabled,
.btn-plain:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 36, 41, 0.38);
  display: grid;
  place-items: center;
  padding: 16px;
}

.modal-card {
  width: min(640px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #d8eae2;
  box-shadow: 0 14px 30px rgba(15, 36, 41, 0.24);
  padding: 16px;
  display: grid;
  gap: 10px;
}

.template-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-label {
  display: grid;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #2f4858;
}

.modal-card textarea {
  width: 100%;
  border: 1px solid #c8dbd7;
  border-radius: 10px;
  padding: 10px;
  font: inherit;
}

.removal-text {
  border-color: #fecaca;
  background: #fff1f1;
  color: #991b1b;
}

.modal-actions {
  justify-content: flex-end;
}

.warn-text {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #f3d8a0;
  background: #fff8e6;
  color: #8a5a00;
  font-size: 0.82rem;
}

.post-body {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.45;
  color: #29443b;
}

@media (max-width: 768px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>
