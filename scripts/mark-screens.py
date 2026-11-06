#!/usr/bin/env python3
"""Append verified screen statuses. Usage: mark-screens.py "<stage label>" "<tests>" id:note id:note ..."""
import sys
label, tests, *items = sys.argv[1:]
p = 'packages/types/src/screen-status.ts'
s = open(p).read()
body = s[:s.rstrip().rfind('};')]
add = f"  // ---- {label} ----\n"
for it in items:
    sid, _, note = it.partition(':')
    t = ", ".join('E2E' if x == 'E2E' else f"'{x}'" for x in tests.split())
    body = body.replace(f"  '{sid}': {{ status: 'scaffolded'", f"  // '{sid}' superseded below\n  '_{sid}': {{ status: 'scaffolded'")
    add += f"  '{sid}': v([{t}]{', ' + repr(note) if note else ''}),\n"
open(p, 'w').write(body + add + "};\n")
