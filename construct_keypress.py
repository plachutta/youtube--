#!/usr/bin/env python3
from Xlib.protocol import event
from Xlib import X
from Xlib.display import Display
import time

d = Display()
print("Display:", d)

# Check event module
print("\nevent module members:")
for attr in dir(event):
    if not attr.startswith('_') and 'Key' in attr:
        print(f"  {attr}: {type(getattr(event, attr)).__name__}")

# Try to construct a KeyPress event
print("\n--- Constructing KeyPress event ---")
try:
    # From the original smoke test:
    # keypress_ctrl = event.KeyPress(root, root, X.CurrentTime, 0, 0, 0, 0, ctrl_kc, 0, 0, 0)
    # But this seems to have too many args. Let check the signature.
    
    # Check the KeyPress class
    kp = event.KeyPress
    print("KeyPress class:", kp)
    print("KeyPress bases:", kp.__bases__ if hasattr(kp, '__bases__') else 'N/A')
    
    # Try different constructor signatures
    # From Xlib source, KeyPress might be: KeyPress(window, child, time, root, event, same_screen, detail, ...)
    # Let me just try the original args
    
    root = d.screen.root
    ctrl_kc = d.keysym_to_keycode(XK.string_to_keysym("Control_L"))
    print(f"Control_L keycode: {ctrl_kc}")
    
    # Try the original constructor
    keypress = event.KeyPress(root, root, X.CurrentTime, 0, 0, 0, 0, ctrl_kc, 0, 0, 0)
    print("KeyPress created successfully:", keypress)
    
    # Send the event
    print("Sending event...")
    d.send_event(root, keypress)
    d.sync()
    time.sleep(0.5)
    print("Event sent successfully!")
except Exception as e:
    print("FAILED:", e)
    import traceback
    traceback.print_exc()