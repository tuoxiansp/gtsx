# Elide frames from ordinary app graphs during serve

During a **Runelight Serve Session**, adapters will still apply **Frame Elision** to ordinary app imports. Only the preview graph used by the **Runelight Route Space** receives the **Preview Transform** and preserves frame data, so opening normal application pages under `RUNELIGHT_DEV=1` remains close to ordinary app behavior.
