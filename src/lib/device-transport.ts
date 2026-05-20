import type { DeviceSnapshot } from "./device-state";

export type DeviceTransportSource = "usb" | "hub" | "both";
export type CommandTransport = "usb" | "hub";

export interface SourceAwareDeviceSnapshot extends DeviceSnapshot {
  source: DeviceTransportSource;
}

export function mergeSourceAwareDevices(
  hubDevices: DeviceSnapshot[],
  usbDevices: DeviceSnapshot[],
): SourceAwareDeviceSnapshot[] {
  const usbById = new Map(usbDevices.map((device) => [device.deviceId, device]));
  const hubById = new Map(hubDevices.map((device) => [device.deviceId, device]));
  const deviceIds = new Set([...hubById.keys(), ...usbById.keys()]);

  return Array.from(deviceIds, (deviceId): SourceAwareDeviceSnapshot => {
    const hubDevice = hubById.get(deviceId);
    const usbDevice = usbById.get(deviceId);

    if (hubDevice && usbDevice) {
      const fresherDevice =
        usbDevice.lastMessageAt >= hubDevice.lastMessageAt ? usbDevice : hubDevice;
      return { ...fresherDevice, source: "both" as const };
    }

    if (usbDevice) {
      return { ...usbDevice, source: "usb" as const };
    }

    return { ...(hubDevice as DeviceSnapshot), source: "hub" as const };
  }).sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

export function chooseCommandTransport(input: {
  device: SourceAwareDeviceSnapshot | undefined;
  usbAvailable: boolean;
  hubAvailable: boolean;
}): CommandTransport | undefined {
  if (!input.device) {
    return undefined;
  }

  if ((input.device.source === "usb" || input.device.source === "both") && input.usbAvailable) {
    return "usb";
  }

  if (input.hubAvailable) {
    return "hub";
  }

  return undefined;
}
