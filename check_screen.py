#!/usr/bin/env python3
from Xlib.display import Display

d = Display()
print("d.screen:", d.screen)
print("type(d.screen):", type(d.screen))
print("d.screen type name:", type(d.screen).__name__)

# Try with parentheses
print("\nd.screen():", d.screen())
print("type(d.screen()):", type(d.screen()))

# Check screen attribute
print("\n--- Checking screen ---")
try:
    s = d.screen
    print("screen attr:", s)
    print("screen.root:", s.root if hasattr(s, 'root') else 'no root attr')
except Exception as e:
    print("Error accessing screen attr:", e)