# FUN

A quiz game where the correct answer button dodges your clicks.

## How to play
- Each question has one true answer.
- The **correct** button becomes a "runner" — it jumps to a new spot every ~1s. Chase it down and click it.
- The **wrong** button sits still and clickable, but clicking it does nothing (it's the decoy).
- You have 5 seconds per question before it counts as a miss.

## Files
- `index.html` — page structure (elements only, no styling/logic)
- `style.css` — all visual styling, colors, animations
- `script.js` — game logic: question data, timer, roaming button, sound, leaderboard

## Running it
Just open `index.html` in a browser. No build step, no dependencies.

For VS Code: install the **Live Server** extension, right-click `index.html` → "Open with Live Server" for auto-reload while editing.

## Next ideas
- Swap `leaderboard` array in `script.js` for `localStorage` so scores persist across visits
- Increase difficulty by lowering `speed` in `loadQuestion()` as score climbs
- Add more questions to the `questions` array in `script.js`
