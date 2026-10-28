# Number Forest

An offline-capable, extensible Chinese number-sense game for early learners.

- Read README.md before changing behavior. Keep source independent of build tools and external CDNs. index.html must run via file:// as well as a static HTTP server.
- Each chapter is registered through src/core.js. Keep lesson generation and answer checking independent of DOM/UI. Add chapters without changing existing learning rules.
- Encourage understanding through visible quantity relationships. No default timers, punitive rewards, streak pressure, or forced multiplication memorization.
- Preserve a fixed meaning for multiplication in each scene: items per group × number of groups. Labels, pictures and equations must agree. Division uses equal sharing with whole-number answers.
- Clock hour hands move continuously with minutes; teach whole hours then half hours.
- Progress stays in browser storage. No personal names, performance records, analytics or credentials in the repository.
- Check arithmetic generators and progression with node --test. Visually play all affected chapters at desktop and narrow/mobile sizes before claiming they work.
- Keep screenshots, logs, preview process records and downloadable snapshots in ignored .local/. Do not commit those.
- A repository push and public website publication are distinct actions. Default new GitHub repository visibility is private.

- Chapter award visuals use a distinct, high-contrast forest stage, a growing two-sided badge that visibly flips around the vertical (Y) axis, and a finite buildup / impact / settle sequence ending on the front. Flat front-only Z-axis spinning is not a substitute. Verify the actual animation in Chromium and WebKit, immediate exit controls, and a complete static reduced-motion presentation. Particle count alone is not visual acceptance.
