<template>
  <div>
    <div v-if="loading" class="d-flex justify-center pa-4">
      <v-progress-circular indeterminate size="24" width="2" />
    </div>
    <div v-else-if="error" class="text-center pa-3">
      <v-icon size="32" color="grey" class="mb-2">mdi-docker</v-icon>
      <div class="text-body-2 text-medium-emphasis">
        {{ error === 'forbidden' ? $t('plugin_docker_widget.forbidden') : $t('plugin_docker_widget.load_failed') }}
      </div>
    </div>
    <div v-else>
      <div class="d-flex align-center mb-2" style="gap: 6px">
        <v-chip size="small" variant="tonal" :color="counts.running === counts.total ? 'green' : 'orange'">
          <v-icon start size="14">mdi-docker</v-icon>
          {{ counts.running }}/{{ counts.total }} {{ $t('plugin_docker_widget.running') }}
        </v-chip>
        <v-chip v-if="counts.updates > 0" size="small" variant="tonal" color="primary">
          <v-icon start size="14">mdi-arrow-up-circle</v-icon>
          {{ counts.updates }} {{ $t('plugin_docker_widget.updates') }}
        </v-chip>
        <v-spacer />
        <v-btn size="x-small" variant="text" icon="mdi-open-in-app" :to="'/docker'" :title="$t('plugin_docker_widget.open_docker')" />
      </div>

      <div v-if="visible.length === 0" class="text-caption text-medium-emphasis text-center pa-2">
        {{ $t('plugin_docker_widget.empty') }}
      </div>

      <div v-for="item in visible" :key="item.key" class="dw-row d-flex align-center" :class="{ 'dw-stopped': item.state === 'exited' || item.state === 'created' }">
        <div class="dw-icon dw-clickable" :title="$t('plugin_docker_widget.actions')" @click.stop="openMenu(item)">
          <img v-if="!broken[item.key]" :src="item.icon" alt="" width="24" height="24" @error="broken[item.key] = true" />
          <v-icon v-else size="22" color="grey">{{ item.type === 'stack' ? 'mdi-layers-outline' : 'mdi-docker' }}</v-icon>
          <span class="dw-dot" :class="dotClass(item)" />
        </div>
        <div class="dw-text">
          <div class="text-body-2 dw-name" :title="item.name">
            <a v-if="item.webui && isUp(item)" :href="item.webui" target="_blank" rel="noopener" class="dw-link">{{ item.name }}</a>
            <span v-else>{{ item.name }}</span>
            <v-icon v-if="item.update" size="12" color="primary" class="ml-1" :title="$t('plugin_docker_widget.update_available')">mdi-arrow-up-circle</v-icon>
          </div>
          <div class="text-caption text-medium-emphasis dw-sub">
            <template v-if="item.type === 'stack'">{{ $t('plugin_docker_widget.stack') }} · {{ item.running }}/{{ item.total }}</template>
            <template v-else>{{ item.status }}</template>
          </div>
        </div>
        <v-progress-circular v-if="busy[item.key]" indeterminate size="16" width="2" class="mr-1" />
        <v-menu v-else :model-value="menuOpen === item.key" location="bottom end" @update:model-value="(v) => (menuOpen = v ? item.key : null)">
          <template #activator="{ props }">
            <v-btn v-bind="props" size="x-small" variant="text" icon="mdi-dots-vertical" />
          </template>
          <v-list density="compact">
            <v-list-item v-if="item.webui && isUp(item)" :href="item.webui" target="_blank" prepend-icon="mdi-web" :title="$t('plugin_docker_widget.webui')" />
            <v-list-item v-if="!isUp(item) || item.state === 'partial'" prepend-icon="mdi-play" :title="$t('plugin_docker_widget.start')" @click="act(item, 'start')" />
            <v-list-item v-if="isUp(item)" prepend-icon="mdi-restart" :title="$t('plugin_docker_widget.restart')" @click="act(item, 'restart')" />
            <v-list-item v-if="isUp(item)" prepend-icon="mdi-stop" :title="$t('plugin_docker_widget.stop')" @click="act(item, 'stop')" />
            <v-divider />
            <v-list-item
              prepend-icon="mdi-pencil"
              :title="item.type === 'stack' ? $t('plugin_docker_widget.open_docker') : $t('plugin_docker_widget.edit')"
              :to="item.type === 'stack' ? '/docker' : `/docker/change/${encodeURIComponent(item.name)}`"
            />
          </v-list>
        </v-menu>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useDocker, usePolling, loadSettings, DEFAULT_SETTINGS } from './useDocker.js';

const { loading, error, items, busy, counts, refresh, act } = useDocker();
const settings = ref({ ...DEFAULT_SETTINGS });
const broken = reactive({});
const poll = usePolling(refresh, 5);

// The icon opens the same menu as the ⋮ button (anchored at the ⋮ button).
const menuOpen = ref(null);
const openMenu = (item) => {
  if (busy.value[item.key]) return;
  menuOpen.value = menuOpen.value === item.key ? null : item.key;
};

const isUp = (item) => item.state === 'running' || item.state === 'partial' || item.state === 'restarting';

const dotClass = (item) => {
  if (item.state === 'running') return 'dw-green';
  if (item.state === 'partial' || item.state === 'restarting' || item.state === 'paused') return 'dw-orange';
  return 'dw-grey';
};

const visible = computed(() =>
  items.value.filter((it) => {
    if (settings.value.hidden.includes(it.name)) return false;
    if (it.type === 'stack' && !settings.value.showStacks) return false;
    if (!settings.value.showStopped && !isUp(it)) return false;
    return true;
  }),
);

onMounted(async () => {
  settings.value = await loadSettings();
  await refresh();
  poll.start(settings.value.interval);
});

onUnmounted(() => poll.stop());
</script>

<style scoped>
.dw-row {
  gap: 8px;
  padding: 3px 0;
  min-width: 0;
}
.dw-row + .dw-row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.dw-stopped .dw-icon img,
.dw-stopped .dw-name {
  opacity: 0.55;
}
.dw-icon {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dw-clickable {
  cursor: pointer;
}
.dw-clickable:hover img {
  transform: scale(1.12);
}
.dw-icon img {
  transition: transform 0.12s;
  width: 24px;
  height: 24px;
  object-fit: contain;
  border-radius: 4px;
}
.dw-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 2px solid rgb(var(--v-theme-surface));
}
.dw-green {
  background: #4caf50;
}
.dw-orange {
  background: #ff9800;
}
.dw-grey {
  background: #9e9e9e;
}
.dw-text {
  flex: 1;
  min-width: 0;
}
.dw-name,
.dw-sub {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.25;
}
.dw-link {
  color: inherit;
  text-decoration: none;
}
.dw-link:hover {
  text-decoration: underline;
  color: rgb(var(--v-theme-primary));
}
</style>
