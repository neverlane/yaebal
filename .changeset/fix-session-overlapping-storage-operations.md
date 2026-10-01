---
"@yaebal/session": patch
---

serialize explicit saves, clears, and final flushes within an update so delayed storage writes cannot restore a cleared session.
