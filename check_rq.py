#!/usr/bin/env python3
from Xlib.protocol import rq
print("rq module members:")
for attr in dir(rq):
    if not attr.startswith('_'):
        print(f"  {attr}: {type(getattr(rq, attr)).__name__}")