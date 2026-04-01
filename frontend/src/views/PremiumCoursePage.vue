<script setup>
import AppNavbar from "../components/common/AppNavbar.vue";
</script>

<template>
  <AppNavbar />
  <main class="page">
    <section class="panel premium">
      <h2 class="title">🌟 Premium Course Page</h2>
      <p class="muted">
        Welcome to premium-only learning content. This route is protected by VIP status.
      </p>
    </section>
  </main>
</template>

<style scoped>
.premium {
  max-width: 780px;
  margin: 30px auto;
}
</style>
