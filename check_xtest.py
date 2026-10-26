#!/usr/bin/env python3
"""Check XTest extension API."""
from Xlib.ext import xtest
import inspect

print("XTest module members:")
for name in dir(xtest):
    if not name.startswith('_'):
        obj = getattr(xtest, name)
        print(f"  {name}: {type(obj).__name__} = {obj}")

print("\n--- inspect.getmembers ---")
for name, obj in inspect.getmembers(xtest):
    if not name.startswith('_') and callable(obj):
        print(f"  {name}: {obj.__module__}.{obj.__qualname__}")