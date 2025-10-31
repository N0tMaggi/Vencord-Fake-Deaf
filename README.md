# FakeDeafen

Adds a fake deafen toggle to Discord’s voice controls so you can look deafened without touching the native device state.

> [!WARNING]
> Unofficial plugin. If you can’t get it working, use an official Vencord build instead of asking for support.

## Installing

1. Build Vencord from source (see the Vencord docs if you have not done this before).
2. Drop this folder into `src/plugins/FakeDeafen` inside your Vencord clone.
3. Register `FakeDeafen` in `src/manifest.json`.
4. Rebuild Vencord and launch Discord with the freshly built client.

## Usage

- Launch Discord with Vencord injected.
- Right-click the deafen/headphone button in the bottom-left user panel.
- Toggle the **Fake Deafen** checkbox to enable or disable the effect.
- A toast and a red highlight on the deafen button confirm when the fake state is active.

## What It Does

- Injects a `Fake Deafen` checkbox into the voice settings context menu via a global context menu patch.
- Rewrites outbound voice-state WebSocket payloads while fake deafen is enabled to keep Discord aligned with the spoofed state.


## Contributing

- Fork the repo.
- Use common sense.
