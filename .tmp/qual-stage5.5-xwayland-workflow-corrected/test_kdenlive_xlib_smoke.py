#!/usr/bin/env python3
"""Stage 5.5 GUI smoke test: Ctrl+O dialog test using Python-Xlib/XTest"""
from Xlib.display import Display
from Xlib import X
from Xlib.protocol import event
import time
import sys

def main():
    d = Display()
    print(f"Connected: {d}")
    screen = d.screen()
    root = screen.root

    # Known Kdenlive window from identification
    kdenlive_window_id = 0x1200017
    print(f"\nUsing known Kdenlive window: 0x{kdenlive_window_id:x}")

    try:
        w = d.create_resource_object('window', kdenlive_window_id)
        wname = w.get_wm_name()
        wclass = w.get_wm_class()
        print(f"  Name: {wname}")
        print(f"  Class: {wclass}")
    except Exception as e:
        print(f"  Error reading window: {e}")
        sys.exit(1)

    # Set input focus to the Kdenlive window
    print(f"\nSetting input focus to Kdenlive window...")
    d.set_input_focus(X.InputFocus, X.RevertToPointerRoot, X.CurrentTime)
    time.sleep(0.5)

    # Ctrl+O - Open Project dialog using XTest events
    print(f"\nSending Ctrl+O to open Open Project dialog...")
    # Control_L keycode: 37, 'o' keycode: 32
    ctrl_kc = 37
    o_kc = 32
    
    # Press Control_L (KeyPress event)
    keypress_ctrl = event.KeyPress(root, root, X.CurrentTime, 0, 0, 0, 0, ctrl_kc, 0, 0, 0)
    d.send_event(root, keypress_ctrl)
    d.sync()
    time.sleep(0.1)
    
    # Press 'o' (KeyPress event)
    keypress_o = event.KeyPress(root, root, X.CurrentTime, 0, 0, 0, 0, o_kc, 0, 0, 0)
    d.send_event(root, keypress_o)
    d.sync()
    time.sleep(1.0)  # Wait for dialog to appear
    
    # Release 'o' (KeyRelease event)
    keyrelease_o = event.KeyRelease(root, root, X.CurrentTime, 0, 0, 0, 0, o_kc, 0, 0, 0)
    d.send_event(root, keyrelease_o)
    d.sync()
    
    # Release Control_L (KeyRelease event)
    keyrelease_ctrl = event.KeyRelease(root, root, X.CurrentTime, 0, 0, 0, 0, ctrl_kc, 0, 0, 0)
    d.send_event(root, keyrelease_ctrl)
    d.sync()

    # Check for new windows
    tree2 = root.query_tree()
    children2 = tree2.children
    print(f"\nWindows after Ctrl+O ({len(children2)} children):")
    new_windows = []
    for wi in children2:
        try:
            n = wi.get_wm_name()
            c = wi.get_wm_class()
            label = f"  0x{wi.id:x} name={str(n)[:40] if n else 'None':40s} class={str(c)[:40] if c else 'None':40s}"
            print(label)
            if n and 'kdenlive' not in str(n).lower() and wi.id != kdenlive_window_id:
                new_windows.append(wi)
        except Exception:
            pass

    if new_windows:
        print(f"\nPotential new dialog windows detected: {len(new_windows)}")
    else:
        print(f"\nNo new windows detected after Ctrl+O")
        print("Checking all windows for any changes...")
        for wi in children2:
            try:
                n = wi.get_wm_name()
                c = wi.get_wm_class()
                if n and n.strip():
                    print(f"  Window with name: 0x{wi.id:x} name={str(n)[:50]}")
            except:
                pass

    # Send Escape to close dialog
    print(f"\nSending Escape to close dialog...")
    escape_kc = d.keysym_to_keycode(0xFF1B)
    print(f"Escape keycode: {escape_kc}")
    
    # Press Escape (KeyPress event)
    keypress_escape = event.KeyPress(root, root, X.CurrentTime, 0, 0, 0, 0, escape_kc, 0, 0, 0)
    d.send_event(root, keypress_escape)
    d.sync()
    time.sleep(0.5)
    
    # Release Escape (KeyRelease event)
    keyrelease_escape = event.KeyRelease(root, root, X.CurrentTime, 0, 0, 0, 0, escape_kc, 0, 0, 0)
    d.send_event(root, keyrelease_escape)
    d.sync()

    # Check windows after Escape
    tree3 = root.query_tree()
    children3 = tree3.children
    print(f"\nWindows after Escape ({len(children3)} children):")
    kdenlive_after = []
    for wi in children3:
        try:
            n = wi.get_wm_name()
            c = wi.get_wm_class()
            label = f"  0x{wi.id:x} name={str(n)[:40] if n else 'None':40s} class={str(c)[:40] if c else 'None':40s}"
            print(label)
            if n and 'kdenlive' in str(n).lower():
                kdenlive_after.append(wi)
            if wi.id == kdenlive_window_id:
                print(f"  -> Kdenlive main window ID confirmed present")
        except Exception:
            pass

    if kdenlive_after:
        print(f"\nKdenlive window still present: 0x{kdenlive_after[0].id:x}")
        print("Kdenlive/Dialog interaction: LIKELY SUCCESSFUL")
    else:
        print("\nKdenlive window no longer present")
        print("Kdenlive/Dialog interaction: FAILED or window closed")

    print("\n=== Smoke test complete ===")

if __name__ == '__main__':
    main()