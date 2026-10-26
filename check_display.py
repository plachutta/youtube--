#!/usr/bin/env python3
"""Check Display object attributes for XTest."""
from Xlib.display import Display
from Xlib.ext import xtest

d = Display()
print("Display attributes related to XTest:")
for attr in dir(d):
    if 'xtest' in attr.lower() or 'test' in attr.lower() or 'fake' in attr.lower() or 'input' in attr.lower():
        print(f"  {attr}: {getattr(d, attr, None)}")

print("\n--- Check xtest module access ---")
print("Can import xtest:", True)
mod = __import__('Xlib.ext.xtest', fromlist=[''])
print("Module:", mod)
print("Module fake_input:", getattr(mod, 'fake_input', None))

print("\n--- Try d.xfake ---")
if hasattr(d, 'xfake'):
    print("d.xfake available:", d.xfake)
    print("d.xfake methods:", [m for m in dir(d.xfake) if not m.startswith('_')])
else:
    print("d.xfake not available")

print("\n--- Check Display connection info ---")
print("connectionX:", d.connectionX)
print("connectionY:", d.connectionY)
print("screen:", d.screen())