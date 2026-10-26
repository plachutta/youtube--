#!/usr/bin/env python3
from Xlib.display import Display
d = Display()
xt = getattr(d, 'xtest_fake_input', None)
print("type:", type(xt))
print("value:", xt)