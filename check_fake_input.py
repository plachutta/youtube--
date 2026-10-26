#!/usr/bin/env python3
"""Check if Display has fake_input method."""
from Xlib.display import Display

d = Display()
print("d.fake_input:", hasattr(d, 'fake_input'))
print("d.xtest:", hasattr(d, 'xtest'))

if hasattr(d, 'fake_input'):
    import inspect
    try:
        print(inspect.getsource(d.fake_input))
    except:
        print("Could not get source")

if hasattr(d, 'xtest'):
    from Xlib.ext import xtest
    print("d.xtest.fake_input:", hasattr(d.xtest, 'fake_input'))
    print("d.xtest.fake_input source:", end=" ")
    try:
        print(inspect.getsource(d.xtest.fake_input))
    except:
        print("Could not get source")