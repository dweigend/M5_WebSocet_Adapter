#include <Arduino.h>
#include <ArduinoJson.h>
#include <M5Unified.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <esp_system.h>

#include <cmath>
#include <cstring>

namespace {

constexpr const char *FirmwareVersion = "0.1.0";
constexpr const char *DeviceRole = "controller";
constexpr const char *PreferencesNamespace = "adapter";
constexpr const char *UsbFallbackDeviceId = "m5stick-plus2-usb";

constexpr const char *FrameTypeRegister = "register";
constexpr const char *FrameTypeHeartbeat = "heartbeat";
constexpr const char *FrameTypeImu = "imu";
constexpr const char *FrameTypeOrientation = "orientation";
constexpr const char *FrameTypeConfigureResult = "configureResult";

constexpr const char *CommandCalibrate = "calibrate";
constexpr const char *CommandPause = "pause";
constexpr const char *CommandResume = "resume";
constexpr const char *CommandIdentify = "identify";
constexpr const char *CommandReboot = "reboot";
constexpr const char *CommandConfigure = "configure";

constexpr uint32_t WifiReconnectIntervalMs = 3000;
constexpr uint32_t WebSocketReconnectIntervalMs = 3000;
constexpr uint32_t WebSocketPingIntervalMs = 1000;
constexpr uint32_t WebSocketPongTimeoutMs = 1000;
constexpr uint8_t WebSocketMissedPongLimit = 2;
constexpr uint32_t HeartbeatIntervalMs = 2000;
constexpr uint32_t ImuIntervalMs = 20;
constexpr uint32_t DisplayIntervalMs = 500;
constexpr uint32_t IdentifyDurationMs = 3000;
constexpr uint32_t SerialBufferLimit = 512;
constexpr uint16_t DefaultWebSocketPort = 80;
constexpr int BatteryMinMv = 3300;
constexpr int BatteryMaxMv = 4200;
constexpr int RssiWeakDbm = -88;
constexpr int RssiStrongDbm = -50;

struct DeviceConfig {
  String ssid;
  String password;
  String serverUrl;
  String deviceId;
};

struct WebSocketEndpoint {
  String host;
  String path = "/";
  uint16_t port = DefaultWebSocketPort;
  bool secure = false;
};

struct ParseEndpointResult {
  bool ok;
  const char *error;
};

ParseEndpointResult endpointResult(bool ok, const char *error) {
  ParseEndpointResult result = {ok, error};
  return result;
}

struct ImuSample {
  float accelX = 0.0F;
  float accelY = 0.0F;
  float accelZ = 0.0F;
  float gyroX = 0.0F;
  float gyroY = 0.0F;
  float gyroZ = 0.0F;
  float pitch = 0.0F;
  float roll = 0.0F;
  float yaw = 0.0F;
};

Preferences preferences;
WebSocketsClient webSocket;
DeviceConfig config;
ImuSample lastSample;

String serialLine;
String latestStatusMessage = "Booting";
uint32_t sequenceNumber = 0;
uint32_t lastWifiAttemptMs = 0;
uint32_t lastWebSocketAttemptMs = 0;
uint32_t lastHeartbeatMs = 0;
uint32_t lastImuMs = 0;
uint32_t lastDisplayMs = 0;
uint32_t identifyUntilMs = 0;
uint32_t lastConnectedStatusChangeMs = 0;

bool hasConfig = false;
bool webSocketConfigured = false;
bool webSocketConnected = false;
bool streamingEnabled = true;
bool calibrated = false;

void setStatus(const char *message) {
  latestStatusMessage = message;
}

bool hasInternalImu() {
  return M5.Imu.getType() != m5::imu_none;
}

uint32_t nextSequence() {
  sequenceNumber += 1;
  return sequenceNumber;
}

bool hasNetworkConfig() {
  return config.ssid.length() > 0 && config.serverUrl.length() > 0 && config.deviceId.length() > 0;
}

const char *effectiveDeviceId() {
  return config.deviceId.length() > 0 ? config.deviceId.c_str() : UsbFallbackDeviceId;
}

int clampInt(int value, int minimum, int maximum) {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

float clampFloat(float value, float minimum, float maximum) {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

int batteryPercentFromMillivolts(int millivolts) {
  const int clampedMillivolts = clampInt(millivolts, BatteryMinMv, BatteryMaxMv);
  return ((clampedMillivolts - BatteryMinMv) * 100) / (BatteryMaxMv - BatteryMinMv);
}

int rssiBarsFromDbm(int rssi) {
  if (rssi <= RssiWeakDbm) {
    return 1;
  }

  if (rssi >= RssiStrongDbm) {
    return 4;
  }

  return 1 + (((rssi - RssiWeakDbm) * 3) / (RssiStrongDbm - RssiWeakDbm));
}

bool isPositivePort(const String &value, uint16_t &port) {
  if (value.length() == 0 || value.length() > 5) {
    return false;
  }

  uint32_t parsedPort = 0;
  for (size_t index = 0; index < value.length(); index += 1) {
    const char nextChar = value.charAt(index);
    if (!isDigit(nextChar)) {
      return false;
    }

    parsedPort = (parsedPort * 10U) + static_cast<uint32_t>(nextChar - '0');
    if (parsedPort > 65535U) {
      return false;
    }
  }

  if (parsedPort == 0U) {
    return false;
  }

  port = static_cast<uint16_t>(parsedPort);
  return true;
}

ParseEndpointResult parseWebSocketUrl(const String &serverUrl, WebSocketEndpoint &endpoint) {
  String url = serverUrl;
  url.trim();
  endpoint = WebSocketEndpoint{};

  if (url.startsWith("ws://")) {
    endpoint.secure = false;
    url.remove(0, 5);
  } else if (url.startsWith("wss://")) {
    endpoint.secure = true;
    return endpointResult(false, "wss URLs are not supported");
  } else {
    return endpointResult(false, "URL must start with ws://");
  }

  const int pathStart = url.indexOf('/');
  String authority = pathStart >= 0 ? url.substring(0, pathStart) : url;
  authority.trim();
  endpoint.path = pathStart >= 0 ? url.substring(pathStart) : "/";

  if (authority.length() == 0) {
    return endpointResult(false, "WebSocket host is missing");
  }

  if (authority.startsWith("[")) {
    return endpointResult(false, "IPv6 hosts are not supported");
  }

  const int portStart = authority.lastIndexOf(':');
  if (portStart >= 0) {
    endpoint.host = authority.substring(0, portStart);
    String portText = authority.substring(portStart + 1);
    if (!isPositivePort(portText, endpoint.port)) {
      return endpointResult(false, "WebSocket port is invalid");
    }
  } else {
    endpoint.host = authority;
    endpoint.port = DefaultWebSocketPort;
  }

  endpoint.host.trim();
  endpoint.path.trim();
  if (endpoint.host.length() == 0) {
    return endpointResult(false, "WebSocket host is missing");
  }

  if (endpoint.path.length() == 0 || !endpoint.path.startsWith("/")) {
    return endpointResult(false, "WebSocket path is invalid");
  }

  return endpointResult(true, "");
}

void loadConfig() {
  preferences.begin(PreferencesNamespace, true);
  config.ssid = preferences.getString("ssid", "");
  config.password = preferences.getString("password", "");
  config.serverUrl = preferences.getString("serverUrl", "");
  config.deviceId = preferences.getString("deviceId", "");
  preferences.end();
  hasConfig = hasNetworkConfig();
  setStatus(hasConfig ? "Configuration loaded" : "No saved configuration");
}

bool saveConfig(const DeviceConfig &nextConfig) {
  preferences.begin(PreferencesNamespace, false);
  preferences.putString("ssid", nextConfig.ssid);
  preferences.putString("password", nextConfig.password);
  preferences.putString("serverUrl", nextConfig.serverUrl);
  preferences.putString("deviceId", nextConfig.deviceId);
  preferences.end();

  config = nextConfig;
  hasConfig = hasNetworkConfig();
  setStatus(hasConfig ? "Configuration saved" : "Configuration incomplete");

  return hasConfig;
}

void sendConfigureResult(bool ok, const char *message) {
  JsonDocument response;
  response["type"] = FrameTypeConfigureResult;
  response["ok"] = ok;
  response["message"] = message;
  serializeJson(response, Serial);
  Serial.println();
  setStatus(message);
}

template <typename TDocument>
bool sendJsonDocument(TDocument &document) {
  String payload;
  serializeJson(document, payload);
  Serial.println(payload);

  if (!webSocketConnected) {
    return true;
  }

  return webSocket.sendTXT(payload);
}

template <typename TDocument>
void addBaseFrame(TDocument &document, const char *type) {
  document["type"] = type;
  document["deviceId"] = effectiveDeviceId();
  document["role"] = DeviceRole;
  document["seq"] = nextSequence();
  document["timeMs"] = millis();
  document["quality"] = 1;
}

void sendRegisterFrame() {
  JsonDocument document;
  addBaseFrame(document, FrameTypeRegister);
  document["firmwareVersion"] = FirmwareVersion;
  JsonArray capabilities = document["capabilities"].to<JsonArray>();
  capabilities.add("imu");
  capabilities.add("orientation");
  sendJsonDocument(document);
}

void sendHeartbeatFrame() {
  JsonDocument document;
  addBaseFrame(document, FrameTypeHeartbeat);
  document["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  document["freeHeap"] = ESP.getFreeHeap();
  document["batteryVoltage"] = static_cast<float>(M5.Power.getBatteryVoltage()) / 1000.0F;
  document["uptimeMs"] = millis();
  document["calibrated"] = calibrated;
  document["streaming"] = streamingEnabled;
  sendJsonDocument(document);
}

void sendImuFrame(const ImuSample &sample) {
  JsonDocument document;
  addBaseFrame(document, FrameTypeImu);
  JsonObject accel = document["accel"].to<JsonObject>();
  accel["x"] = sample.accelX;
  accel["y"] = sample.accelY;
  accel["z"] = sample.accelZ;
  JsonObject gyro = document["gyro"].to<JsonObject>();
  gyro["x"] = sample.gyroX;
  gyro["y"] = sample.gyroY;
  gyro["z"] = sample.gyroZ;
  sendJsonDocument(document);
}

void sendOrientationFrame(const ImuSample &sample) {
  JsonDocument document;
  addBaseFrame(document, FrameTypeOrientation);
  document["pitch"] = sample.pitch;
  document["roll"] = sample.roll;
  document["yaw"] = sample.yaw;
  sendJsonDocument(document);
}

void drawSignalBars(int x, int y, int activeBars, uint16_t activeColor, uint16_t inactiveColor) {
  constexpr int BarCount = 4;
  constexpr int BarWidth = 4;
  constexpr int BarGap = 2;
  constexpr int BarStepHeight = 4;

  for (int index = 0; index < BarCount; index += 1) {
    const int barHeight = (index + 1) * BarStepHeight;
    const int barX = x + (index * (BarWidth + BarGap));
    const int barY = y + ((BarCount * BarStepHeight) - barHeight);
    M5.Display.fillRect(barX, barY, BarWidth, barHeight, index < activeBars ? activeColor : inactiveColor);
  }
}

void drawBatteryBar(
    int x,
    int y,
    int width,
    int height,
    int percent,
    uint16_t fillColor,
    uint16_t frameColor,
    uint16_t backgroundColor) {
  constexpr int TerminalWidth = 3;
  M5.Display.drawRect(x, y, width, height, frameColor);
  M5.Display.fillRect(x + width, y + 3, TerminalWidth, height - 6, frameColor);

  const int fillWidth = ((width - 4) * clampInt(percent, 0, 100)) / 100;
  M5.Display.fillRect(x + 2, y + 2, width - 4, height - 4, backgroundColor);
  M5.Display.fillRect(x + 2, y + 2, fillWidth, height - 4, fillColor);
}

void drawWebSocketNode(int x, int y, bool connected, uint32_t phase, uint16_t accentColor) {
  const uint16_t inactiveColor = connected ? TFT_DARKGREY : TFT_RED;
  const uint16_t linkColor = connected ? accentColor : inactiveColor;
  const int pulseRadius = connected ? 8 + static_cast<int>(phase % 3U) : 8;

  M5.Display.drawCircle(x + 8, y + 8, pulseRadius, inactiveColor);
  M5.Display.fillCircle(x + 8, y + 8, 4, linkColor);
  M5.Display.fillCircle(x + 27, y + 8, 4, linkColor);
  if (connected) {
    M5.Display.drawLine(x + 12, y + 8, x + 23, y + 8, linkColor);
  } else {
    M5.Display.drawLine(x + 12, y + 11, x + 17, y + 5, linkColor);
    M5.Display.drawLine(x + 19, y + 11, x + 24, y + 5, linkColor);
  }
}

void drawHorizon(int x, int y, int width, int height, const ImuSample &sample, uint32_t phase, uint16_t accentColor) {
  const int centerX = x + (width / 2);
  const int centerY = y + (height / 2);
  const int radius = (width < height ? width : height) / 2 - 4;
  const float rollRadians = sample.roll * PI / 180.0F;
  const float pitchOffset = clampFloat(sample.pitch, -35.0F, 35.0F) * static_cast<float>(radius) / 45.0F;
  const int lineDx = static_cast<int>(cosf(rollRadians) * static_cast<float>(radius));
  const int lineDy = static_cast<int>(sinf(rollRadians) * static_cast<float>(radius));
  const int horizonY = centerY + static_cast<int>(pitchOffset);
  const float orbitRadians = (sample.yaw + static_cast<float>((phase % 12U) * 30U)) * PI / 180.0F;
  const int orbitX = centerX + static_cast<int>(cosf(orbitRadians) * static_cast<float>(radius - 7));
  const int orbitY = centerY + static_cast<int>(sinf(orbitRadians) * static_cast<float>(radius - 7));

  M5.Display.drawCircle(centerX, centerY, radius, TFT_DARKGREY);
  M5.Display.drawCircle(centerX, centerY, radius - 8, TFT_DARKGREY);
  M5.Display.drawLine(centerX - lineDx, horizonY - lineDy, centerX + lineDx, horizonY + lineDy, accentColor);
  M5.Display.drawLine(centerX - 8, centerY, centerX + 8, centerY, TFT_WHITE);
  M5.Display.drawLine(centerX, centerY - 8, centerX, centerY + 8, TFT_WHITE);
  M5.Display.fillCircle(centerX, centerY, 2, TFT_WHITE);
  M5.Display.fillCircle(orbitX, orbitY, 3, TFT_YELLOW);
}

void drawTelemetryPulse(int x, int y, int width, uint32_t phase, uint16_t accentColor) {
  const int pulseX = x + static_cast<int>((phase * 11U) % static_cast<uint32_t>(width));
  M5.Display.drawFastHLine(x, y, width, TFT_DARKGREY);
  M5.Display.fillCircle(pulseX, y, 3, accentColor);
  M5.Display.drawLine(pulseX - 6, y, pulseX - 2, y - 4, accentColor);
  M5.Display.drawLine(pulseX + 2, y - 4, pulseX + 6, y, accentColor);
}

void drawStatus() {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const bool identifying = millis() < identifyUntilMs;
  const String ipAddress = wifiConnected ? WiFi.localIP().toString() : "-";
  const int batteryMillivolts = M5.Power.getBatteryVoltage();
  const int batteryPercent = batteryPercentFromMillivolts(batteryMillivolts);
  const int rssi = wifiConnected ? WiFi.RSSI() : RssiWeakDbm;
  const int width = M5.Display.width();
  const int height = M5.Display.height();
  const uint32_t phase = millis() / DisplayIntervalMs;
  const uint16_t backgroundColor = identifying ? TFT_ORANGE : TFT_BLACK;
  const uint16_t accentColor = identifying ? TFT_BLACK : TFT_CYAN;
  const uint16_t okColor = identifying ? TFT_BLACK : TFT_GREEN;
  const uint16_t mutedColor = identifying ? TFT_DARKGREY : TFT_DARKGREY;
  const uint16_t textColor = identifying ? TFT_BLACK : TFT_WHITE;
  const uint16_t batteryColor = batteryPercent > 20 ? okColor : TFT_RED;
  const int margin = 6;
  const int headerBottom = 52;
  const int footerY = height - 42;
  const int availableHorizonHeight = footerY - headerBottom - 4;
  const int horizonLimit = width - 22 < availableHorizonHeight ? width - 22 : availableHorizonHeight;
  const int horizonSize = clampInt(horizonLimit, 42, 96);
  const int horizonX = (width - horizonSize) / 2;
  const int horizonY = headerBottom + ((availableHorizonHeight - horizonSize) / 2);

  M5.Display.startWrite();
  M5.Display.fillScreen(backgroundColor);
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(textColor, backgroundColor);

  M5.Display.setCursor(margin, 4);
  M5.Display.printf("M5 WS");
  M5.Display.setCursor(width - 54, 4);
  M5.Display.printf("%3d%%", batteryPercent);
  drawBatteryBar(width - 43, 18, 34, 12, batteryPercent, batteryColor, textColor, backgroundColor);

  M5.Display.setCursor(margin, 20);
  M5.Display.printf("%.18s", effectiveDeviceId());
  drawSignalBars(margin, 36, wifiConnected ? rssiBarsFromDbm(rssi) : 0, okColor, mutedColor);
  drawWebSocketNode(width - 42, 34, webSocketConnected, phase, okColor);

  drawHorizon(horizonX, horizonY, horizonSize, horizonSize, lastSample, phase, accentColor);

  M5.Display.setCursor(margin, footerY);
  M5.Display.printf("IP %s", ipAddress.c_str());
  M5.Display.setCursor(margin, footerY + 12);
  M5.Display.printf("%s %.14s", streamingEnabled ? "LIVE" : "PAUSE", identifying ? "IDENTIFY" : latestStatusMessage.c_str());
  drawTelemetryPulse(margin, height - 8, width - (margin * 2), phase, accentColor);

  M5.Display.endWrite();
}

void calibrateImu() {
  if (!hasInternalImu()) {
    setStatus("No internal IMU");
    return;
  }

  M5.Imu.setCalibration(64, 64, 0);
  M5.Imu.saveOffsetToNVS();
  calibrated = true;
  setStatus("IMU calibrated");
}

void handleCommand(const uint8_t *payload, size_t length) {
  JsonDocument document;
  DeserializationError error = deserializeJson(document, payload, length);
  if (error) {
    setStatus("Invalid command JSON");
    return;
  }

  const char *type = document["type"] | "";
  if (strcmp(type, CommandCalibrate) == 0) {
    calibrateImu();
  } else if (strcmp(type, CommandPause) == 0) {
    streamingEnabled = false;
    setStatus("Streaming paused");
  } else if (strcmp(type, CommandResume) == 0) {
    streamingEnabled = true;
    setStatus("Streaming resumed");
  } else if (strcmp(type, CommandIdentify) == 0) {
    identifyUntilMs = millis() + IdentifyDurationMs;
    setStatus("Identify");
  } else if (strcmp(type, CommandReboot) == 0) {
    setStatus("Rebooting");
    ESP.restart();
  }
}

bool isDeviceCommandType(const char *type) {
  return strcmp(type, CommandCalibrate) == 0 || strcmp(type, CommandPause) == 0 ||
         strcmp(type, CommandResume) == 0 || strcmp(type, CommandIdentify) == 0 ||
         strcmp(type, CommandReboot) == 0;
}

void handleWebSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      lastConnectedStatusChangeMs = millis();
      setStatus("WebSocket connected");
      sendRegisterFrame();
      break;
    case WStype_DISCONNECTED:
      webSocketConnected = false;
      webSocketConfigured = false;
      lastConnectedStatusChangeMs = millis();
      setStatus("WebSocket disconnected");
      break;
    case WStype_ERROR:
      webSocketConnected = false;
      webSocketConfigured = false;
      lastConnectedStatusChangeMs = millis();
      setStatus("WebSocket error");
      break;
    case WStype_TEXT:
      handleCommand(payload, length);
      break;
    default:
      break;
  }
}

void disconnectWebSocket() {
  if (webSocketConfigured || webSocketConnected) {
    webSocket.disconnect();
  }
  webSocketConfigured = false;
  webSocketConnected = false;
}

void beginWifiConnection(uint32_t nowMs) {
  if (!hasConfig || WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (lastWifiAttemptMs != 0 && nowMs - lastWifiAttemptMs < WifiReconnectIntervalMs) {
    return;
  }

  lastWifiAttemptMs = nowMs;
  setStatus("Connecting WiFi");
  WiFi.disconnect(false);
  WiFi.begin(config.ssid.c_str(), config.password.c_str());
}

void beginWebSocketConnection(uint32_t nowMs) {
  if (!hasConfig || WiFi.status() != WL_CONNECTED || webSocketConfigured || webSocketConnected) {
    return;
  }

  if (lastWebSocketAttemptMs != 0 && nowMs - lastWebSocketAttemptMs < WebSocketReconnectIntervalMs) {
    return;
  }

  WebSocketEndpoint endpoint;
  const ParseEndpointResult result = parseWebSocketUrl(config.serverUrl, endpoint);
  if (!result.ok) {
    lastWebSocketAttemptMs = nowMs;
    setStatus(result.error);
    return;
  }

  lastWebSocketAttemptMs = nowMs;
  setStatus("Connecting WebSocket");
  webSocket.begin(endpoint.host.c_str(), endpoint.port, endpoint.path.c_str(), "");
  webSocket.onEvent(handleWebSocketEvent);
  webSocket.setReconnectInterval(WebSocketReconnectIntervalMs);
  webSocket.enableHeartbeat(WebSocketPingIntervalMs, WebSocketPongTimeoutMs, WebSocketMissedPongLimit);
  webSocketConfigured = true;
}

void maintainConnections(uint32_t nowMs) {
  if (!hasConfig) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    disconnectWebSocket();
    beginWifiConnection(nowMs);
    return;
  }

  beginWebSocketConnection(nowMs);
}

DeviceConfig readConfigFromDocument(JsonDocument &document) {
  DeviceConfig nextConfig;
  nextConfig.ssid = document["ssid"] | "";
  nextConfig.password = document["password"] | "";
  nextConfig.serverUrl = document["serverUrl"] | "";
  nextConfig.deviceId = document["deviceId"] | "";
  nextConfig.ssid.trim();
  nextConfig.serverUrl.trim();
  nextConfig.deviceId.trim();
  return nextConfig;
}

void applySavedConfig(const DeviceConfig &nextConfig) {
  disconnectWebSocket();
  WiFi.disconnect(false);
  lastWifiAttemptMs = 0;
  lastWebSocketAttemptMs = 0;
  saveConfig(nextConfig);
}

void handleSetupDocument(JsonDocument &document) {
  const char *type = document["type"] | "";
  if (isDeviceCommandType(type)) {
    String payload;
    serializeJson(document, payload);
    handleCommand(reinterpret_cast<const uint8_t *>(payload.c_str()), payload.length());
    return;
  }

  if (strcmp(type, CommandConfigure) != 0) {
    sendConfigureResult(false, "Unsupported setup message");
    return;
  }

  const DeviceConfig nextConfig = readConfigFromDocument(document);
  if (!nextConfig.ssid.length() || !nextConfig.serverUrl.length() || !nextConfig.deviceId.length()) {
    sendConfigureResult(false, "Missing ssid, serverUrl, or deviceId");
    return;
  }

  WebSocketEndpoint endpoint;
  const ParseEndpointResult result = parseWebSocketUrl(nextConfig.serverUrl, endpoint);
  if (!result.ok) {
    sendConfigureResult(false, result.error);
    return;
  }

  applySavedConfig(nextConfig);
  sendConfigureResult(true, "Configuration saved");
}

void handleSerialLine() {
  JsonDocument document;
  DeserializationError error = deserializeJson(document, serialLine);
  serialLine = "";

  if (error) {
    sendConfigureResult(false, "Invalid JSON");
    return;
  }

  handleSetupDocument(document);
}

void readSerialSetup() {
  while (Serial.available() > 0) {
    const char nextChar = static_cast<char>(Serial.read());
    if (nextChar == '\r') {
      continue;
    }

    if (nextChar == '\n') {
      handleSerialLine();
      continue;
    }

    if (serialLine.length() < SerialBufferLimit) {
      serialLine += nextChar;
    } else {
      serialLine = "";
      sendConfigureResult(false, "Setup message too long");
    }
  }
}

bool readImuSample(ImuSample &sample, float deltaSeconds) {
  if (!hasInternalImu() || !M5.Imu.update()) {
    return false;
  }

  const auto data = M5.Imu.getImuData();
  sample.accelX = data.accel.x;
  sample.accelY = data.accel.y;
  sample.accelZ = data.accel.z;
  sample.gyroX = data.gyro.x;
  sample.gyroY = data.gyro.y;
  sample.gyroZ = data.gyro.z;

  sample.pitch =
      atan2f(sample.accelY, sqrtf(sample.accelX * sample.accelX + sample.accelZ * sample.accelZ)) *
      180.0F / PI;
  sample.roll = atan2f(-sample.accelX, sample.accelZ) * 180.0F / PI;
  sample.yaw += sample.gyroZ * deltaSeconds;
  return true;
}

void sendTelemetry(uint32_t nowMs) {
  if (nowMs - lastHeartbeatMs >= HeartbeatIntervalMs) {
    lastHeartbeatMs = nowMs;
    sendHeartbeatFrame();
  }

  if (!streamingEnabled || nowMs - lastImuMs < ImuIntervalMs) {
    return;
  }

  const float deltaSeconds = static_cast<float>(nowMs - lastImuMs) / 1000.0F;
  ImuSample sample = lastSample;
  if (!readImuSample(sample, deltaSeconds)) {
    return;
  }

  lastImuMs = nowMs;
  lastSample = sample;
  sendImuFrame(lastSample);
  sendOrientationFrame(lastSample);
}

void refreshDisplay(uint32_t nowMs) {
  if (nowMs - lastDisplayMs < DisplayIntervalMs && lastConnectedStatusChangeMs != nowMs) {
    return;
  }

  lastDisplayMs = nowMs;
  drawStatus();
}

}  // namespace

void setup() {
  auto m5Config = M5.config();
  m5Config.serial_baudrate = 115200;
  m5Config.clear_display = true;
  m5Config.internal_imu = true;
  M5.begin(m5Config);
  calibrated = M5.Imu.loadOffsetFromNVS();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);

  loadConfig();
  webSocket.onEvent(handleWebSocketEvent);
  drawStatus();
  sendConfigureResult(hasConfig, hasConfig ? "Configuration loaded" : "No saved configuration");
  sendRegisterFrame();
}

void loop() {
  const uint32_t nowMs = millis();

  M5.update();
  readSerialSetup();
  maintainConnections(nowMs);

  if (webSocketConfigured || webSocketConnected) {
    webSocket.loop();
  }

  sendTelemetry(nowMs);
  refreshDisplay(nowMs);
  yield();
}
