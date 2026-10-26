import pyatspi
import time
import os
import dbus

os.environ['QT_ACCESSIBILITY'] = '1'
os.environ['QT_LINUX_ACCESSIBILITY_ALWAYS_ON'] = '1'

print('AT-SPI Smoke Test v2')
time.sleep(1)

bus = dbus.SessionBus()
kdenlive_name = 'org.kde.kdenlive-1107700'

# List all available paths under Kdenlive
try:
    # Get the list of names - we already know org.kde.kdenlive-1107700
    # Try common paths
    paths_to_try = ['/', '/MainApplication', '/MainWindow', '/centralWidget', '/ui']
    
    for path in paths_to_try:
        try:
            obj = bus.get_object(kdenlive_name, path)
            # Try introspect
            try:
                data = obj.Introspect()
                # Extract node name from introspection
                import re
                m = re.search(r'<node[^>]*name="([^"]+)"', str(data))
                node_name = m.group(1) if m else 'unknown'
                print(f'Path {path}: exists, introspectable, node={node_name}')
            except:
                print(f'Path {path}: exists, no introspection')
        except Exception as e:
            print(f'Path {path}: {type(e).__name__}')
except Exception as e:
    print(f'Error: {type(e).__name__}: {e}')

# Try to get MainApplication and explore its children
try:
    main_app = bus.get_object(kdenlive_name, '/MainApplication')
    print(f'\nMainApplication obtained')
    
    # Get all children under MainApplication
    # In D-Bus, we need to traverse the object tree
    props = dbus.Interface(main_app, 'org.freedesktop.DBus.Properties')
    
    # Try to get the accessible interface info
    print('Checking for accessible children...')
    
    # Try introspect MainApplication
    try:
        data = main_app.Introspect()
        import re
        # Find all node names
        nodes = re.findall(r'<node[^>]*name="([^"]+)"', str(data))
        print(f'MainApplication child nodes: {nodes}')
    except Exception as e:
        print(f'MainApplication introspect error: {type(e).__name__}: {e}')
except Exception as e:
    print(f'Get MainApplication error: {type(e).__name__}: {e}')

print('\nSmoke test complete')
