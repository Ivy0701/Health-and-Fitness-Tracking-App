import { computed, ref } from "vue";
import api from "./api";

const favorites = ref([]);
const loading = ref(false);
const loaded = ref(false);
const me = ref(null);

function normalizeType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value === "article") return "forum";
  return value;
}

function favoriteKey(itemType, itemId) {
  return `${normalizeType(itemType)}::${String(itemId || "").trim()}`;
}

const byKey = computed(() => {
  const map = new Map();
  for (const row of favorites.value) {
    map.set(favoriteKey(row.itemType, row.itemId), row);
  }
  return map;
});

async function ensureMe() {
  if (me.value?.id) return me.value;
  me.value = await api.get("/users/me").then((r) => r.data);
  return me.value;
}

async function refreshFavorites() {
  const user = await ensureMe();
  loading.value = true;
  try {
    const rows = await api.get(`/favorites/${user.id}`).then((r) => r.data);
    favorites.value = Array.isArray(rows) ? rows : [];
    loaded.value = true;
    return favorites.value;
  } finally {
    loading.value = false;
  }
}

async function ensureFavoritesLoaded() {
  if (loaded.value) return favorites.value;
  return refreshFavorites();
}

function isFavorited(itemType, itemId) {
  return byKey.value.has(favoriteKey(itemType, itemId));
}

async function addFavorite(payload) {
  const user = await ensureMe();
  const request = { ...payload, userId: user.id, itemType: normalizeType(payload.itemType) };
  const row = await api.post("/favorites", request).then((r) => r.data);
  const key = favoriteKey(request.itemType, request.itemId);
  const next = favorites.value.filter((item) => favoriteKey(item.itemType, item.itemId) !== key);
  next.unshift(row);
  favorites.value = next;
  loaded.value = true;
  return row;
}

async function removeFavoriteByRowId(rowId) {
  if (!rowId) return;
  await api.delete(`/favorites/${rowId}`);
  favorites.value = favorites.value.filter((item) => String(item._id) !== String(rowId));
}

async function removeFavoriteByItem(itemType, itemId) {
  const row = byKey.value.get(favoriteKey(itemType, itemId));
  if (!row?._id) return false;
  await removeFavoriteByRowId(row._id);
  return true;
}

async function toggleFavorite(payload) {
  const exists = byKey.value.get(favoriteKey(payload.itemType, payload.itemId));
  if (exists?._id) {
    await removeFavoriteByRowId(exists._id);
    return { action: "removed", row: exists };
  }
  const row = await addFavorite(payload);
  return { action: "added", row };
}

export function useFavorites() {
  return {
    favorites,
    loading,
    loaded,
    byKey,
    normalizeType,
    ensureFavoritesLoaded,
    refreshFavorites,
    isFavorited,
    addFavorite,
    removeFavoriteByRowId,
    removeFavoriteByItem,
    toggleFavorite,
  };
}
