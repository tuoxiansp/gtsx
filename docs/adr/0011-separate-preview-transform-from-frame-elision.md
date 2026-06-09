# Separate Preview Transform from Frame Elision

Runelight will distinguish preview-only transforms from ordinary app graph frame stripping. `RUNELIGHT_DEV=1` enables the **Runelight Route Space** and **Preview Transform** for Studio rendering, but **Frame Elision** remains the mechanism that keeps source-level frames out of ordinary app code; adapters must choose the correct transform mode for preview imports versus normal app imports instead of treating Runelight Dev Mode as a blanket transform toggle.
