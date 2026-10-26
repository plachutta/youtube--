#!/usr/bin/env python3
from Xlib.display import Display
from Xlib.ext import xtest
d = Display()
print("Connected:", d)

# Check xtest_fake_input
xt = d.xtest_fake_input
print("\nxtest_fake_input type:", type(xt))
print("xtest_fake_input value:", xt)

# Check if it's the module function
from Xlib.ext import xtest as xtest_mod
print("\nModule fake_input:", xtest_mod.fake_input)
print("Same?", xt == xtest_mod.fake_input)

# Try calling it
print("\n--- Calling d.xtest_fake_input ---")
try:
    # The function signature is: fake_input(self, event_type, detail=0, time=X.CurrentTime, root=X.NONE, x=0, y=0)
    # But 'self' here might be the display or something else
    # Let's try with just the key parameters
    print("Calling with event type and keycode...")
    # Try different calling conventions
    result = xt(X.KeyPress, 37, X.CurrentTime, d.screen.root, 0, 0)
    print("Result with xt():", result)
except Exception as e:
    print("FAILED xt():", e)

try:
    print("Calling d.xtest_fake_input directly...")
    d.xtest_fake_input(X.KeyPress, 37, X.CurrentTime, d.screen.root, 0, 0)
    print("SUCCESS")
except Exception as e:
    print("FAILED direct:", e)