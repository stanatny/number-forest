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

- Everyday play uses bright picture-book forest art and one consistent squirrel companion. Keep decorative objects outside countable quantities, preserve stable touch targets, and animate only a newly changed object after a manipulation. Do not replay every acorn entrance on each DOM repaint. Long parent guidance stays collapsible; mathematical hints remain immediately available. Motion is finite and respects reduced-motion preferences.

- Each supported task keeps a prominent primary mathematical relationship beside/below its prompt and on the final result. Selected answers may fill unknowns as clearly marked, unverified proposals. Keep the draft styling and question markers until solved, including numerically correct answers with incomplete equal sharing. Do not infer correctness from selection; only validated completion receives green/check confirmation. Preserve multiplication order, comparison left/right positions, sequence gaps, and human-readable time units; never expose internal minute encodings as equations.

- Freeze each task’s first submitted outcome independently from later correction. A wrong answer immediately explains the error and allows Next; correction must not erase its incorrect mark or count the task twice. Persist these outcomes on resume, distinguish ungraded legacy completions, and show first-answer counts in results and parent records. First-answer timing stops at the first check; preserve old practice timings separately. A wrong final question must remain on its explanation until the child explicitly ends the chapter.
