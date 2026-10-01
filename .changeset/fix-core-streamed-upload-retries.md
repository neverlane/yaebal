---
"@yaebal/core": patch
---

reuse buffered upload streams within one api call so retries send the original bytes instead of empty files.
