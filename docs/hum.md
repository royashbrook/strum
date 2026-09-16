# mains hum (refs #1)

## evidence

A 50 or 60 Hz mains series has members at 100/120, 150/180 and 200/240 Hz, inside the 250-cent search range of real targets, and the series supplies its own harmonic support. Simulated at the real frame timing, a 60 Hz series alone at -45, -60 and -75 dBFS read as A2 sharp 151 cents and G3 flat 147 cents on every frame at the quiet preset; a 50 Hz series read as A2 flat 165 and D3 sharp 37. After a plucked note faded, the wrong strings stayed lit on every frame. These are generated series, not recordings of a room, and the levels say nothing about audibility.

## change

A single frame cannot tell hum from a chord by frequency: an Open G guitar uniformly 35 cents sharp puts G2, D3, G3 and D4 on 100, 150, 200 and 300 Hz. Two things can. No guitar string supplies 50 or 60 Hz, so the series must contain its base plus two more of the first four multiples, within half a percent or 0.4 bins. And hum holds its level within a decibel for as long as it lasts, while a ringing string falls a couple of decibels a second and arrives with a jump. So `hum.js` tracks each member across frames: it is masked only after holding within 1.5 dB for two seconds, a rise releases that member at once, and a fall restarts its clock with a short grace so the hum's own tail cannot flash a wrong string. A loud note's window skirt can bury faint members for a few frames, so the tracker keeps its memory through an absence of up to 1.5 seconds. Masked members leave the candidate, harmonic and loudest-peak sets, and a masked peak is kept only when it sits within 12 dB of the hum's own level, measured from low members that cannot be that peak's partials. The raw maxima used by the isolation rule are untouched.

The tracker lives in the continuation path, where frame time already lives; `analyseSpectrum` masks nothing on its own and takes the mask through its options.

## limits

Masking begins about 2.7 seconds after the hum begins, or after listening starts in a room that already hums: until then the screen shows what it showed before. Hum whose base is missing, such as a series reaching a microphone that rolls off below 100 Hz, is not recognised and reads as before. A string plucked onto a multiple reads while it rings, because its onset and its decay both release that member; only a note holding within 1.5 dB for two seconds on a multiple would be masked. A chord read sharp is never masked, however long it sustains, because it has no base.

A separate limit that this change neither causes nor removes: a hum member within two bins of a target's fundamental shares its FFT main lobe and pulls the interpolated peak. Open G's G2 at 98 Hz beside a 50 Hz series' 100 Hz member reads up to 8 cents sharp when the note is at the hum's own level, 3 cents 6 dB louder, and under a cent 20 dB louder, identically with and without the tracker; at 96 kHz the pull moves to D3 beside 150 Hz. B3, 21.3 cents below 250 Hz, is pulled 0.3 cents at most.

Two earlier rules were rejected by their own controls and are recorded here so they are not tried again: any three members anywhere masked a real B in a full strum, because a strum scatters partials onto sparse high multiples by chance; and three low members without the base masked the sharp Open G chord above, leaving stale green on screen. Checks replay hum alone at three levels, both bases, three rates and both presets; hum under a note, a strum and a decay; the sharp chord control with and without memory; a note plucked onto a multiple; hum starting and stopping; the nearest targets in tune at 96 kHz; and the tracker's own rules. Voice and sung vowels remain open in #1.
