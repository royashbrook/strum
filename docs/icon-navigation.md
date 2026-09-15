# icon navigation and a visual first strum (refs #13)

Follow-up to the glanceable tuning display. The tuner keeps the tagline, one
short prompt, strings and note names. No inline settings or second instructional
sentence. The version is fixed at the safe top-right viewport edge on every view.

The three-control dock uses MIT-licensed Tabler icons, with accessible names and
keyboard focus. Ear starts/stops the microphone and returns to the tuner in one
action; its filled white state and small stop square indicate active capture.
Gear opens settings, where the microphone stays live for sensitivity adjustment.
Tapping the selected gear closes settings without interrupting the note. Info
opens About and stops capture. Escape returns to the tuner without starting it.
Settings/About scroll inside the app; the dock remains reachable in portrait and
landscape. Green is left to the actual confirmed tuning display.

A hand sweeps across the strings until the first confident measured note in this
opening. Silence/noise cannot retire it; it never generates fake pitch readings.
It hides during permission requests, settings/About and backgrounding, and stays
retired after a successful note until reload. Reduced motion uses a static hand.
The short prompt identifies the physical action: tap the ear, then strum.

The detector, continuation limits and tuning memory are unchanged by this slice.
Existing update-consent, microphone lifecycle and offline tests remain in place;
navigation tests cover icon names, touch targets, no double activation, live
settings, first-note retirement, background/resume and reduced motion.

Recovery prompts also name the ear. Landscape keeps the same label reservation
as portrait, including optional numbers: every rail must end at least 8px above
its label. The regression failed at -4px in both browser engines before removing
the undersized landscape overrides; the stale-copy check also failed before repair.
