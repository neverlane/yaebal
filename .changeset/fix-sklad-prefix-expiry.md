---
"@yaebal/sklad": patch
---

escape redis glob characters in storage prefixes so key enumeration and clear stay within their literal namespace. prevent sqlite touch from reviving expired rows.
