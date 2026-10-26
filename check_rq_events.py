#!/usr/bin/env python3
from Xlib.protocol import rq
from Xlib import X

print("Checking for KeyPress/KeyRelease in X module:")
print("X.KeyPress:", X.KeyPress)
print("X.KeyRelease:", X.KeyRelease)
print("X.ButtonPress:", X.ButtonPress)

# Try to construct events using X.KeyPress/X.KeyRelease
# The rq.Event type might have subclasses
print("\nrq.Event:", rq.Event)
print("rq.KeyPress:", getattr(rq, 'KeyPress', 'NOT FOUND'))
print("rq.KeyRelease:", getattr(rq, 'KeyRelease', 'NOT FOUND'))

# Check if there are event classes
print("\nChecking event types...")
for attr in dir(rq):
    if 'Key' in attr or 'Release' in attr or 'Press' in attr:
        print(f"  rq.{attr}: {type(getattr(rq, attr)).__name__}")