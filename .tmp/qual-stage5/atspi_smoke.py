import pyatspi
import time
import os
import dbus

os.environ['QT_ACCESSIBILITY'] = '1'
os.environ['QT_LINUX_ACCESSIBILITY_ALWAYS_ON'] = '1'

print('AT-SPI Smoke Test')
time.sleep(1)

# Try D-Bus approach first (more reliable for Wayland KDE apps)
bus = dbus.SessionBus()
kdenlive_name = 'org.kde.kdenlive-1107700'

found = False
try:
    mainwin = bus.get_object(kdenlive_name, '/MainWindow')
    print(f'Found Kdenlive MainWindow via D-Bus')
    found = True
    
    # Check platform
    props = dbus.Interface(mainwin, 'org.freedesktop.DBus.Properties')
    platform = props.Get('org.qtproject.Qt.QApplication', 'platformName')
    print(f'Platform: {platform}')
except Exception as e:
    print(f'D-Bus error: {type(e).__name__}: {e}')

# Try pyatspi registry
if not found:
    print('\nTrying pyatspi registry...')
    try:
        registry = pyatspi.registry.Registry()
        print(f'Registry created')
    except Exception as e:
        print(f'Registry error: {type(e).__name__}: {e}')

print('\nSmoke test complete')
