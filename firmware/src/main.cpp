#include <Arduino.h>
#include <ArduinoJson.h>
#include <M5Unified.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <esp_system.h>

#include <cmath>

namespace {

constexpr const char *FirmwareVersion = "0.1.0";
constexpr const char *DeviceRole = "controller";
constexpr const char *PreferencesNamespace = "adapter";

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

struct DeviceConfig {
  String ssid;
  String password;
  String serverUrl;
  String deviceId;
};

struct WebSocketEndpoint {
  String host;
  String path = "/";
  uint16_t port = 80;
  bool secure = false;
};

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

void sendConfigureResult(bool ok, const char *message) {
  StaticJsonDocument<192> response;
  response["type"] = "configureResult";
  response["ok"] = ok;
  response["message"] = message;
  serializeJson(response, Serial);
  Serial.println();
}

void loadConfig() {
  preferences.begin(PreferencesNamespace, true);
  config.ssid = preferences.getString("ssid", "");
  config.password = preferences.getString("password", "");
  config.serverUrl = preferences.getString("serverUrl", "");
  config.deviceId = preferences.getString("deviceId", "");
  preferences.end();
  hasConfig = hasNetworkConfig();
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

  return hasConfig;
}

bool parseWebSocketUrl(const String &serverUrl, WebSocketEndpoint &endpoint) {
  String url = serverUrl;
  endpoint = WebSocketEndpoint{};

  if (url.startsWith("ws://")) {
    endpoint.secure = false;
    url.remove(0, 5);
    endpoint.port = 80;
  } else if (url.startsWith("wss://")) {
    endpoint.secure = true;
    url.remove(0, 6);
    endpoint.port = 443;
  } else {
    return false;
  }

  const int pathStart = url.indexOf('/');
  String authority = pathStart >= 0 ? url.substring(0, pathStart) : url;
  endpoint.path = pathStart >= 0 ? url.substring(pathStart) : "/";

  const int portStart = authority.lastIndexOf(':');
  if (portStart >= 0) {
    endpoint.host = authority.substring(0, portStart);
    endpoint.port = static_cast<uint16_t>(authority.substring(portStart + 1).toInt());
  } else {
    endpoint.host = authority;
  }

  return endpoint.host.length() > 0 && endpoint.port > 0 && endpoint.path.length() > 0;
}

void drawStatus() {
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const bool identifying = millis() < identifyUntilMs;

  M5.Display.startWrite();
  M5.Display.fillScreen(identifying ? TFT_ORANGE : TFT_BLACK);
  M5.Display.setCursor(0, 0);
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(TFT_WHITE, identifying ? TFT_ORANGE : TFT_BLACK);
  M5.Display.printf("M5 WS Adapter\n");
  M5.Display.printf("Device: %s\n", config.deviceId.length() > 0 ? config.deviceId.c_str() : "not set");
  M5.Display.printf("WiFi: %s\n", wifiConnected ? "connected" : "offline");
  M5.Display.printf("IP: %s\n", wifiConnected ? WiFi.localIP().toString().c_str() : "-");
  M5.Display.printf("RSSI: %d dBm\n", wifiConnected ? WiFi.RSSI() : 0);
  M5.Display.printf("WS: %s\n", webSocketConnected ? "connected" : "offline");
  M5.Display.printf("Streaming: %s\n", streamingEnabled ? "yes" : "paused");
  M5.Display.endWrite();
}

template <typename TDocument>
bool sendJsonDocument(TDocument &document) {
  if (!webSocketConnected) {
    return false;
  }

  String payload;
  serializeJson(document, payload);
  return webSocket.sendTXT(payload);
}

template <typename TDocument>
void addBaseFrame(TDocument &document, const char *type) {
  document["type"] = type;
  document["deviceId"] = config.deviceId;
  document["role"] = DeviceRole;
  document["seq"] = nextSequence();
  document["timeMs"] = millis();
  document["quality"] = 1;
}

void sendRegisterFrame() {
  StaticJsonDocument<256> document;
  addBaseFrame(document, "register");
  document["firmwareVersion"] = FirmwareVersion;
  JsonArray capabilities = document.createNestedArray("capabilities");
  capabilities.add("imu");
  capabilities.add("orientation");
  sendJsonDocument(document);
}

void sendHeartbeatFrame() {
  StaticJsonDocument<320> document;
  addBaseFrame(document, "heartbeat");
  document["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  document["freeHeap"] = ESP.getFreeHeap();
  document["batteryVoltage"] = static_cast<float>(M5.Power.getBatteryVoltage()) / 1000.0F;
  document["uptimeMs"] = millis();
  document["calibrated"] = calibrated;
  document["streaming"] = streamingEnabled;
  sendJsonDocument(document);
}

void sendImuFrame(const ImuSample &sample) {
  StaticJsonDocument<320> document;
  addBaseFrame(document, "imu");
  JsonObject accel = document.createNestedObject("accel");
  accel["x"] = sample.accelX;
  accel["y"] = sample.accelY;
  accel["z"] = sample.accelZ;
  JsonObject gyro = document.createNestedObject("gyro");
  gyro["x"] = sample.gyroX;
  gyro["y"] = sample.gyroY;
  gyro["z"] = sample.gyroZ;
  sendJsonDocument(document);
}

void sendOrientationFrame(const ImuSample &sample) {
  StaticJsonDocument<256> document;
  addBaseFrame(document, "orientation");
  document["pitch"] = sample.pitch;
  document["roll"] = sample.roll;
  document["yaw"] = sample.yaw;
  sendJsonDocument(document);
}

void calibrateImu() {
  if (hasInternalImu()) {
    M5.Imu.setCalibration(64, 64, 0);
    M5.Imu.saveOffsetToNVS();
    calibrated = true;
  }
}

void handleCommand(const uint8_t *payload, size_t length) {
  StaticJsonDocument<192> document;
  DeserializationError error = deserializeJson(document, payload, length);
  if (error) {
    return;
  }

  const char *type = document["type"] | "";
  if (strcmp(type, "calibrate") == 0) {
    calibrateImu();
  } else if (strcmp(type, "pause") == 0) {
    streamingEnabled = false;
  } else if (strcmp(type, "resume") == 0) {
    streamingEnabled = true;
  } else if (strcmp(type, "identify") == 0) {
    identifyUntilMs = millis() + IdentifyDurationMs;
  } else if (strcmp(type, "reboot") == 0) {
    ESP.restart();
  }
}

void handleWebSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      webSocketConnected = true;
      lastConnectedStatusChangeMs = millis();
      sendRegisterFrame();
      break;
    case WStype_DISCONNECTED:
    case WStype_ERROR:
      webSocketConnected = false;
      webSocketConfigured = false;
      lastConnectedStatusChangeMs = millis();
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
  if (!parseWebSocketUrl(config.serverUrl, endpoint) || endpoint.secure) {
    lastWebSocketAttemptMs = nowMs;
    return;
  }

  lastWebSocketAttemptMs = nowMs;
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

void readSerialSetup() {
  while (Serial.available() > 0) {
    const char nextChar = static_cast<char>(Serial.read());
    if (nextChar == '\r') {
      continue;
    }

    if (nextChar == '\n') {
      StaticJsonDocument<512> document;
      DeserializationError error = deserializeJson(document, serialLine);
      serialLine = "";

      if (error) {
        sendConfigureResult(false, "Invalid JSON");
        continue;
      }

      const char *type = document["type"] | "";
      if (strcmp(type, "configure") != 0) {
        sendConfigureResult(false, "Unsupported setup message");
        continue;
      }

      DeviceConfig nextConfig;
      nextConfig.ssid = document["ssid"] | "";
      nextConfig.password = document["password"] | "";
      nextConfig.serverUrl = document["serverUrl"] | "";
      nextConfig.deviceId = document["deviceId"] | "";

      if (!nextConfig.ssid.length() || !nextConfig.serverUrl.length() || !nextConfig.deviceId.length()) {
        sendConfigureResult(false, "Missing ssid, serverUrl, or deviceId");
        continue;
      }

      if (!saveConfig(nextConfig)) {
        sendConfigureResult(false, "Configuration save failed");
        continue;
      }

      disconnectWebSocket();
      WiFi.disconnect(false);
      lastWifiAttemptMs = 0;
      lastWebSocketAttemptMs = 0;
      sendConfigureResult(true, "Configuration saved");
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

bool readImuSample(ImuSample &sample) {
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

  sample.pitch = atan2f(sample.accelY, sqrtf(sample.accelX * sample.accelX + sample.accelZ * sample.accelZ)) * 180.0F / PI;
  sample.roll = atan2f(-sample.accelX, sample.accelZ) * 180.0F / PI;
  sample.yaw += sample.gyroZ * (static_cast<float>(ImuIntervalMs) / 1000.0F);
  return true;
}

void sendTelemetry(uint32_t nowMs) {
  if (!webSocketConnected) {
    return;
  }

  if (nowMs - lastHeartbeatMs >= HeartbeatIntervalMs) {
    lastHeartbeatMs = nowMs;
    sendHeartbeatFrame();
  }

  if (!streamingEnabled || nowMs - lastImuMs < ImuIntervalMs) {
    return;
  }

  lastImuMs = nowMs;
  ImuSample sample = lastSample;
  if (!readImuSample(sample)) {
    return;
  }

  lastSample = sample;
  sendImuFrame(lastSample);
  sendOrientationFrame(lastSample);
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

  if (nowMs - lastDisplayMs >= DisplayIntervalMs || lastConnectedStatusChangeMs == nowMs) {
    lastDisplayMs = nowMs;
    drawStatus();
  }

  yield();
}
