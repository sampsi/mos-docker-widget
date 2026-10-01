// Shared data layer for the widget and the plugin page.
// Talks only to the MOS API (same endpoints the MOS Docker page uses):
//   GET  /api/v1/docker/containers/json?all=true      Docker Engine API (proxied, admin only)
//   GET  /api/v1/docker/mos/containers                MOS order + update status
//   GET  /api/v1/docker/mos/compose/stacks            compose stacks
//   POST /api/v1/docker/containers/<name>/<action>    start | stop | restart
//   POST /api/v1/docker/mos/compose/stacks/<name>/<action>
import { ref, computed } from 'vue';

export const PLUGIN = 'docker-widget';

export const DEFAULT_SETTINGS = {
  interval: 5,
  showStopped: true,
  showStacks: true,
  hidden: [],
};

const authHeaders = () => ({
  Authorization: 'Bearer ' + localStorage.getItem('authToken'),
});

const getJson = async (url) => {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = new Error(`${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
};

export async function loadSettings() {
  try {
    const data = await getJson(`/api/v1/mos/plugins/settings/${PLUGIN}`);
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      hidden: Array.isArray(data?.hidden) ? data.hidden : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings) {
  const res = await fetch(`/api/v1/mos/plugins/settings/${PLUGIN}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.ok;
}

// "http://[ADDRESS]:[PORT:3001]/x" -> "http://<this host>:<published port>/x"
function resolveWebUi(template, ports, hostNetwork) {
  if (!template) return null;
  let url = template.replace(/\[(ADDRESS|IP)\]/g, window.location.hostname);
  url = url.replace(/\[PORT:(\d+)\]/g, (_, p) => {
    if (hostNetwork) return p;
    const hit = (ports || []).find((x) => String(x.PrivatePort) === p && x.PublicPort);
    return hit ? String(hit.PublicPort) : p;
  });
  return url;
}

const containerName = (c) => (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '');

export function useDocker() {
  const loading = ref(true);
  const error = ref(null); // null | 'forbidden' | 'failed'
  const items = ref([]); // containers and stacks, in MOS order
  const busy = ref({}); // key -> action in progress

  const refresh = async () => {
    try {
      const [containers, mos, stacks] = await Promise.all([
        getJson('/api/v1/docker/containers/json?all=true'),
        getJson('/api/v1/docker/mos/containers').catch(() => []),
        getJson('/api/v1/docker/mos/compose/stacks').catch(() => []),
      ]);
      const mosByName = Object.fromEntries((mos || []).map((m) => [m.name, m]));
      const stackOf = {};
      for (const s of stacks || []) for (const c of s.containers || []) stackOf[c] = s.name;

      const list = [];
      const stackItems = {};
      for (const c of containers) {
        const name = containerName(c);
        const labels = c.Labels || {};
        const running = c.State === 'running';
        const stackName = stackOf[name] || labels['mos.stack.name'];
        if (stackName) {
          const s = (stackItems[stackName] ||= {
            key: `stack:${stackName}`,
            type: 'stack',
            name: stackName,
            icon: `/docker_icons/compose/${stackName}.png`,
            running: 0,
            total: 0,
            containers: [],
            webui: null,
            update: false,
            order: 10000,
          });
          s.total += 1;
          if (running) s.running += 1;
          s.containers.push(name);
          if (!s.webui && labels['mos.webui']) {
            s.webui = resolveWebUi(labels['mos.webui'], c.Ports, c.HostConfig?.NetworkMode === 'host');
          }
          continue;
        }
        const m = mosByName[name];
        list.push({
          key: `container:${name}`,
          type: 'container',
          name,
          icon: `/docker_icons/${name}.png`,
          state: c.State,
          status: c.Status,
          running,
          image: c.Image,
          webui: resolveWebUi(labels['mos.webui'], c.Ports, c.HostConfig?.NetworkMode === 'host'),
          update: !!m?.update_available,
          order: m?.index ?? 5000,
        });
      }
      for (const s of stacks || []) {
        const it = stackItems[s.name];
        if (!it) continue;
        if (s.webui) it.webui = resolveWebUi(s.webui, [], true);
      }
      for (const s of Object.values(stackItems)) {
        s.state = s.running === s.total ? 'running' : s.running === 0 ? 'exited' : 'partial';
      }
      list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      items.value = [...list, ...Object.values(stackItems).sort((a, b) => a.name.localeCompare(b.name))];
      error.value = null;
    } catch (e) {
      error.value = e.status === 403 ? 'forbidden' : 'failed';
    } finally {
      loading.value = false;
    }
  };

  const act = async (item, action) => {
    busy.value = { ...busy.value, [item.key]: action };
    try {
      const url =
        item.type === 'stack'
          ? `/api/v1/docker/mos/compose/stacks/${encodeURIComponent(item.name)}/${action}`
          : `/api/v1/docker/containers/${encodeURIComponent(item.name)}/${action}`;
      await fetch(url, { method: 'POST', headers: authHeaders() });
    } catch {
      // the next refresh shows the real state
    } finally {
      const b = { ...busy.value };
      delete b[item.key];
      busy.value = b;
      await refresh();
    }
  };

  const counts = computed(() => {
    let running = 0;
    let total = 0;
    let updates = 0;
    for (const it of items.value) {
      if (it.type === 'stack') {
        running += it.running;
        total += it.total;
      } else {
        total += 1;
        if (it.running) running += 1;
      }
      if (it.update) updates += 1;
    }
    return { running, total, updates };
  });

  return { loading, error, items, busy, counts, refresh, act };
}

// Poll while the page is visible; pauses in background tabs.
export function usePolling(fn, seconds) {
  let timer = null;
  const tick = () => {
    if (!document.hidden) fn();
  };
  const onVisible = () => {
    if (!document.hidden) fn();
  };
  return {
    start(sec = seconds) {
      this.stop();
      timer = setInterval(tick, Math.max(2, Number(sec) || 5) * 1000);
      document.addEventListener('visibilitychange', onVisible);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
