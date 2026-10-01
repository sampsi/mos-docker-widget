# MOS Docker Widget

A [MOS](https://mos-official.net/) plugin that adds a **Docker widget to the dashboard**,
similar to the Docker overview on the Unraid dashboard.

- every container with its icon and a status dot (green = running, grey = stopped,
  orange = stack partly running)
- `12/15 running` summary and the number of available updates
- click a name to open its web UI (`mos.webui` label, e.g. `http://[ADDRESS]:[PORT:3001]`)
- menu per container (click the icon or ⋮): web UI, start, stop, restart and **Edit** (opens the MOS container settings page)
- compose stacks are shown as one row (`3/4`) and can be started/stopped as a whole
- plugin page (Plugins → Docker Widget): refresh interval, show/hide stopped containers
  and stacks, choose which containers are shown

The widget only uses the MOS API (the same endpoints as the MOS Docker page) with the
logged-in user's token, so it needs an admin account. Nothing runs on the server side.

## Install

MOS Hub → Plugins → **Docker Widget**, then Dashboard → edit → add the
*Docker Widget* card.

## Moving the widget

Drag the card by its ⋮⋮ handle on the dashboard; the button at the bottom right toggles which cards are visible.

## Build

The GitHub Actions workflow builds the Vue plugin and packages it as
`docker-widget-<version>-1+mos-plugin_all.deb` when a tag is pushed:

```bash
git tag 0.1.0 && git push origin 0.1.0
```

Local build without Node installed:

```bash
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v $PWD/page:/app -w /app node:22-alpine \
  sh -c "npm install && npm run build"
```

Plugin layout based on [ich777/mos-intel-gpu-top](https://github.com/ich777/mos-intel-gpu-top).

## License

GPL-3.0
