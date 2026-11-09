# Store images hill climb

Jesse's goal (2026-11-09): every store image scores at least 9 for design and at most 2 for "AI look" from both judges. Each round: change the frames, recapture, have both judges score, show Jesse the table and a short summary, and wait for his OK before the next round.

## The images

Six images are scored: `store/images/screenshot-1.png` to `-5.png` (1280x800) and `tile-c.png` (440x280). Jesse's picks: tile c, and the drawn ridge thumbnail on screenshot 1 (`store/art/thumbs/store-trail.svg`). Tiles a and b stay in the folder but aren't scored any more.

- `store/art/frames.html` draws each frame: `?shot=1` to `5`, `?tile=c`. The `SHOTS` table holds each caption, subline, harness URL, iframe size, offset, scale, CSS to inject, and an optional step.
- `store/art/capture.sh` serves the worktree on 127.0.0.1:8078, screenshots every frame with headless Chrome, checks sizes with `sips`, and fails if Chrome's network log shows any YouTube host.
- Harness additions: `dev/home.html?videos=store` (made-up videos from `store/art/videos.js`, local thumbnails) and `dev/page.html?sample=1` (two weeks of log, Dry hours on).
- `ART-PLAN.md` has the reasons behind the first set.

## Rules

- Only the frames change: `store/art/`, `store/images/`, and the harness files in `dev/`. Never `src/`, `test/`, or `DESIGN.md`. Another session has PRs 101 and 102 open in the worktrees `design-lock-lines` and `fade-failsafe`; don't touch them.
- No real YouTube thumbnails, channel names, or logos. capture.sh enforces the network part.
- Claims must match the product on `main`. Example: "the video stops" has to allow for the "Finish video when time runs out" setting and for limits being optional.
- Unslop rules apply to all captions.
- No uploading, publishing, or tagging. Those wait until PRs 101 and 102 are merged and Jesse says go.

## The judges

Both get the same prompt, `judge-prompt.md`, with `{ROUND_NOTES}` filled in (known drafts, for example). Neither sees earlier scores or the other judge's report, so they don't anchor on them.

- Codex, read-only, from a scratch folder:
  `codex exec --skip-git-repo-check -s read-only -o <dir>/report.md -i store/images/screenshot-1.png ... -i store/images/tile-c.png - < <dir>/prompt.md`
  Its model and effort come from `~/.codex/config.toml` (gpt-6.1-sol, high, as of 2026-11-09). Add a line to `~/codex-trial/log.md` per run.
- An independent Claude agent: a fresh `general-purpose` Agent, not a fork, given the filled prompt and the six image paths to Read. Tell it not to open anything under `store/art/` or `store/art/reviews/`, so it doesn't see earlier scores.
- Save both reports verbatim as `reviews/round-N-codex.md` and `reviews/round-N-claude.md`.
- Before acting on a fix, check it against the image and the code. Note any fix you reject and why in the round's row below.

## What to show Jesse each round

The table, then a summary of at most 5 lines: what changed, what moved, what the judges disagree on, and what's next. Then wait.

| Image | Codex design | Codex AI | Claude design | Claude AI |
|---|---|---|---|---|

## Rounds

### Round 0, 2026-11-09 (commit 1a08f6f)

Codex only; the Claude judge didn't run this round. Full report: `reviews/round-0-codex.md`. Its prompt also scored tiles a and b and named each caption.

| Image | Codex design | Codex AI |
|---|---|---|
| 1 Home | 7 | 3 |
| 2 Lock | 6 | 4 |
| 3 Modes | 7 | 3 |
| 4 Settings | 6 | 2 |
| 5 History | 6 | 3 |
| Tile a | 7 | 3 |
| Tile b | 7 | 2 |
| Tile c | 8 | 2 |

Codex's ranked fixes, which round 1 starts from:

1. Screenshot 2: say limits are optional ("Optional limits pause playback. A drop adds 15 minutes."), and recapture the lock after PR 101 merges. It says "0m watched today" now because the tour runs on a fresh state.
2. Screenshot 1: the card is about 400px wide in a 728px panel. Enlarge the home view, and cut the empty space above the counter.
3. Screenshots 4 and 5: end the crop on a complete section. 4 cuts at the Cards header, 5 at "WHY YOU NEEDED ONE". 5 sits flush with the panel's top.
4. Screenshot 5: the subline promises unlock reasons, but none is readable. Show one, or change the line.
5. Copy: the sublines on 1 and 4 run to three lines. "Pick how much drip does." is vague (Codex: "Choose how YouTube works."). "A search box alone" reads oddly.

Also from round 0:

- What raises the AI-look score: the dark gradient background, the rounded showcase panel, and the headline-left layout. Real UI detail and restrained copy lower it.
- Tile c: make the drop and wordmark group about 10% larger.
- Screenshot 2: make the water read as water, not a glow.
- Screenshot 3: the page's own "drip / Make every drop count." heading repeats the frame's mark. Consider cropping it off.
- Order: keep it if screenshot 2 says limits are optional, or else move the mode choice ahead of the lock.

## Open questions for Jesse (from 2026-11-09, not answered yet)

1. Reword two strings in drip's own UI? "Paid watching stops" (Dry hours, in Settings) can read as a paid service, and "I need this one" doesn't tell a newcomer it's an unlock. These touch `src/`, so they'd be a separate PR after 101 and 102.
2. Push `store/art` and open its drip PR (listing and policy fixes plus the images)?

## Other state

- jesselind PR 32 (privacy page brackets and new bullet) is merged into `development`. PR 33 promotes it to `release`; Jesse merges it.
- Local commits on `store/art`, not pushed yet: `be8a2fe` (LISTING.md, PRIVACY.md), `1a08f6f` (frames and first images), and the picks commit after it.
