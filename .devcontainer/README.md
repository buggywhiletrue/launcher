# Codespaces web preview

This configuration runs the launcher renderer in a browser without starting
Electron. It is intended for layout and UI review only.

## Start

1. Create a Codespace from the `feature/codespaces-preview` branch.
2. Wait for dependency installation to finish.
3. Open the automatically forwarded **Launcher Web Preview** port.

If the preview does not open automatically, run:

```bash
pnpm preview:web
```

Then open port `5173` from the **Ports** panel.

Electron-only actions use an in-memory mock in this preview. Client downloads,
filesystem access, IPC, game launching, packaging, and installer behavior must
still be verified on Windows.
