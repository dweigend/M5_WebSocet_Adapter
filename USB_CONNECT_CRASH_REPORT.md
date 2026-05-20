# USB Connect Crash Report

This is a historical local investigation, not the normal setup guide. Start with
`README.md` and `docs/controller-setup.md` for current student-facing instructions.

Date: 2026-05-20

## Summary

Clicking `Connect USB` can crash Chrome before the application receives a serial port. The crash is
not caused by the telemetry parser or the Svelte render loop. Local crash reports show a native
macOS privacy/TCC abort inside Chrome while Chrome is enumerating Bluetooth serial devices for the
Web Serial chooser.

## Reproduction

Environment:

```text
macOS 26.4.1 (25E253)
Google Chrome 148.0.7778.168
Local app: http://localhost:5173
M5 USB serial device: /dev/cu.usbserial-5B212393021
```

Steps:

1. Open `http://localhost:5173`.
2. Click `Connect USB`.
3. Chrome opens or attempts to open the Web Serial chooser.
4. Chrome exits/crashes and the DevTools page list falls back to `about:blank`.

The same symptom appeared twice in local crash reports:

```text
~/Library/Logs/DiagnosticReports/Google Chrome-2026-05-20-122907.ips
~/Library/Logs/DiagnosticReports/Google Chrome-2026-05-20-123054.ips
```

## Crash Evidence

Both crash reports contain:

```text
Exception: EXC_CRASH / SIGABRT
Termination namespace: TCC
Termination detail:
This app has crashed because it attempted to access privacy-sensitive data without a usage
description. The app's Info.plist must contain an NSBluetoothAlwaysUsageDescription key with a
string value explaining to the user how the app uses this data.
```

The triggered stack includes:

```text
__TCC_CRASHING_DUE_TO_PRIVACY_VIOLATION__
__TCCAccessRequest_block_invoke
IOBluetoothCoreBluetoothCoordinator
IOBluetoothDeviceInquiry
```

The installed Chrome bundle currently has no Bluetooth usage description:

```sh
/usr/libexec/PlistBuddy -c 'Print :NSBluetoothAlwaysUsageDescription' \
  '/Applications/Google Chrome.app/Contents/Info.plist'
```

Result:

```text
Entry, ":NSBluetoothAlwaysUsageDescription", Does Not Exist
```

## Why Web Serial Hits Bluetooth

The Web Serial chooser is not USB-only in Chrome. Official Chrome documentation says Chrome 117+
enumerates paired Bluetooth Classic devices that expose serial/RFCOMM services through Web Serial.
MDN documents `allowedBluetoothServiceClassIds` and `bluetoothServiceClassId` as part of
`navigator.serial.requestPort()` options.

Sources:

- https://developer.chrome.com/blog/serial-over-bluetooth
- https://developer.mozilla.org/en-US/docs/Web/API/Serial/requestPort
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

The local macOS serial inventory also contains:

```text
/dev/cu.Bluetooth-Incoming-Port
/dev/tty.Bluetooth-Incoming-Port
```

That explains why a USB-focused `requestPort()` can still enter Chrome's Bluetooth serial
enumeration path.

## What Is Not The Root Cause

The browser-independent serial path is healthy:

```text
/dev/cu.usbserial-5B212393021
ESP32-PICO-V3-02 confirmed by esptool
Project firmware uploaded successfully with PlatformIO
745 valid JSON device frames captured after flashing
```

An isolated browser test with a fake `navigator.serial` stream also stayed alive and rendered high
rate telemetry:

```text
USB online
fake-usb device visible
~102 Hz telemetry rate
512 valid frames after 3 seconds
Renderer stayed alive
```

So the app's parser, USB session state, raw log, and Svelte UI can handle the expected telemetry
rate. The crash happens at the native permission/device chooser layer before app-level serial
reading is established.

## Likely Root Cause

Chrome 148 on this macOS installation attempts Bluetooth serial discovery during
`navigator.serial.requestPort()`, but its app bundle lacks `NSBluetoothAlwaysUsageDescription`.
macOS TCC terminates the process immediately. This is a browser packaging/OS privacy interaction,
triggered by Web Serial's Bluetooth support.

## Workarounds To Try

1. Use a Chrome/Chromium build whose `Info.plist` contains `NSBluetoothAlwaysUsageDescription`, or
   update Chrome if this build is ahead/experimental.
2. Temporarily remove or disable macOS Bluetooth serial ports such as `Bluetooth-Incoming-Port`,
   then retry `Connect USB`.
3. If a serial permission is already granted, reconnect using `navigator.serial.getPorts()` should
   avoid the chooser. The current code already tries granted ports before calling `requestPort()`.
4. As a code mitigation, narrow the app's Web Serial filters to the exact CH9102 M5 IDs only. This
   may reduce chooser scope, but it cannot guarantee avoiding Chrome's native Bluetooth
   enumeration.
5. Keep the browser-independent `.venv` serial probe as the reliable fallback for hardware
   verification while this Chrome/TCC issue is present.

## Proposed App Follow-Up

- Add an app-visible diagnostic if `requestPort()` fails or the page returns after a chooser error.
- Narrow `M5_SERIAL_FILTERS` to the confirmed M5 CH9102 ID first: `0x1a86:0x55d4`.
- Consider a separate "Use already granted port" action that never calls `requestPort()`.
- Document the macOS Chrome/TCC crash mode in README troubleshooting.

## Current Status

The M5StickC Plus2 and project firmware are working. The blocker is the Chrome native Web Serial
chooser on this macOS/Chrome combination.
