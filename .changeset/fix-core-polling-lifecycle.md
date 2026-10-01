---
"@yaebal/core": patch
---

cancel initialization when polling stops, skip remaining startup callbacks and updates after stop, and serialize rapid restarts with the previous polling cycle. run shutdown callbacks once even on reentrant calls and finish cleanup when another callback fails.
