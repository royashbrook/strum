# glanceable tuning (refs #11)

The old waves indicated sound, but their amplitude did not provide a stable place
to aim while tuning. Keep the dark, rounded instrument and six-string identity;
replace decorative vibration with six pitch markers and one shared centre line.

- sharp is above centre, flat below; arrows point toward the target.
- filled green thumbs-up is a confirmed live tuning. hollow green is remembered.
- dotted grey is uncertain; absent is unheard. neither invents a measured pitch.
- numbers are opt-in. accessible labels retain the pitch direction and cents.
- the critically damped visual spring never decides tuning confidence. reduced
  motion uses immediate positions, without animated colour transitions.

Faint-note continuation is bounded: acquire above the chosen gate, then follow
fresh detector-approved readings down to 18 dB below it (absolute floor -85 dBFS),
within 12 cents of the acquired pitch, for at most 2.5 seconds. A gap longer than
360 ms expires the track. It does not relax harmonic/noise checks, renew itself
forever, acquire another string, or infer pitch from silence. This can extend a
decaying note at typical sensitivity, not recover sound removed by the phone.

Settings use nonselectable chrome, contained scrolling and touch-action:
manipulation. Deliberate pinch zoom remains available; About text remains
selectable. Native controls, keyboard focus and update consent are preserved.

Source for gesture semantics:
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action

The thumbs-up is the MIT-licensed Tabler icon, credited in public/third-party.txt.
No runtime UI, animation or icon dependency is added.
