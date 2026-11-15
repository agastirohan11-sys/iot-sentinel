// Genuine local device health and this application's HTTP counters only.
// No packet capture, network scanning, inferred packet counts, or flow features.
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_random.h>
#include <esp_timer.h>
#include "config.h"

const uint32_t REPORT_INTERVAL_MS = 5000;
const uint32_t RECONNECT_INTERVAL_MS = 10000;
uint32_t lastReportMs = 0;
uint32_t lastReconnectMs = 0;
bool wasConnected = false;
bool everConnected = false;
uint64_t wifiReconnects = 0;
uint64_t completed = 0, successes = 0, failures = 0;
uint64_t payloadBytesAttempted = 0, payloadBytesAccepted = 0;
int lastHttpStatus = 0;  // JSON null until completed > 0.
char bootId[9];

String counter(uint64_t value) {
  char buffer[24];
  snprintf(buffer, sizeof(buffer), "%llu", (unsigned long long)value);
  return String(buffer);
}

String makePayload() {
  // Counters are cumulative since boot and EXCLUDE the current report request.
  // Connectivity is sampled here, not inferred from the HTTP result.
  bool connectedAtSample = WiFi.status() == WL_CONNECTED;
  String body;
  body.reserve(640);
  body = "{\"device_id\":\"" DEVICE_ID "\",\"source\":\"physical-esp32\",\"boot_id\":\"";
  body += bootId;
  body += "\",\"wifi_connected\":";
  body += connectedAtSample ? "true" : "false";
  body += ",\"wifi_rssi_dbm\":";
  body += connectedAtSample ? String(WiFi.RSSI()) : String("null");
  body += ",\"uptime_ms\":" + counter((uint64_t)esp_timer_get_time() / 1000ULL);
  body += ",\"wifi_reconnects\":" + counter(wifiReconnects);
  body += ",\"http_requests_completed\":" + counter(completed);
  body += ",\"http_successes\":" + counter(successes);
  body += ",\"http_failures\":" + counter(failures);
  body += ",\"http_payload_bytes_attempted\":" + counter(payloadBytesAttempted);
  body += ",\"http_payload_bytes_accepted\":" + counter(payloadBytesAccepted);
  body += ",\"last_http_status\":";
  body += completed == 0 ? String("null") : String(lastHttpStatus);
  body += "}";
  return body;
}

void reportTelemetry() {
  String body = makePayload();
  String url = String("http://") + BACKEND_HOST + ":" + String(BACKEND_PORT) + "/api/physical-telemetry";
  WiFiClient client;
  HTTPClient http;
  http.setConnectTimeout(1500);
  http.setTimeout(2000);
  int code = -1000;  // Local sentinel: HTTPClient.begin failed; no POST attempted.
  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    if (strlen(DEVICE_API_KEY) > 0) http.addHeader("X-API-Key", DEVICE_API_KEY);
    // Bytes given to HTTPClient, NOT measured TCP/IP or Wi-Fi bytes.
    payloadBytesAttempted += body.length();
    code = http.POST(body);
    if (code >= 200 && code < 300) {
      // Payload bytes acknowledged by an HTTP 2xx, excluding headers and wire overhead.
      payloadBytesAccepted += body.length();
    }
    http.end();
  }
  ++completed;
  lastHttpStatus = code;
  if (code >= 200 && code < 300) ++successes;
  else ++failures;
  Serial.printf("[%s] HTTP result=%d RSSI=%ld dBm completed=%llu successes=%llu failures=%llu\n",
                DEVICE_ID, code, (long)WiFi.RSSI(), (unsigned long long)completed,
                (unsigned long long)successes, (unsigned long long)failures);
  if (code < 0) Serial.println("Transport failure: check Wi-Fi, laptop LAN IP, backend and firewall.");
  if (code == 401) Serial.println("Device API key mismatch.");
  if (code == 422) Serial.println("Telemetry validation failed: check firmware/backend versions.");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  if (strcmp(DEVICE_ID, "ESP32-01") != 0 && strcmp(DEVICE_ID, "ESP32-02") != 0) {
    Serial.println("Set DEVICE_ID to ESP32-01 or ESP32-02 in config.h.");
    while (true) delay(1000);
  }
  snprintf(bootId, sizeof(bootId), "%08lx", (unsigned long)esp_random());
  Serial.printf("IoT Sentinel %s boot=%s; no network packet capture\n", DEVICE_ID, bootId);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Connecting to configured 2.4 GHz Wi-Fi…");
}

void loop() {
  uint32_t now = millis();
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    if (everConnected) ++wifiReconnects;
    everConnected = true;
    Serial.printf("[%s] Wi-Fi connected; laptop target %s:%d; local IP ", DEVICE_ID, BACKEND_HOST, BACKEND_PORT);
    Serial.println(WiFi.localIP());
  } else if (!connected && wasConnected) {
    Serial.printf("[%s] Wi-Fi interrupted; reports paused until reconnection.\n", DEVICE_ID);
  }
  wasConnected = connected;
  if (!connected) {
    if ((uint32_t)(now - lastReconnectMs) >= RECONNECT_INTERVAL_MS) {
      lastReconnectMs = now;
      Serial.printf("[%s] Wi-Fi status=%d; retrying connection…\n", DEVICE_ID, (int)WiFi.status());
      WiFi.reconnect();
    }
  } else if ((uint32_t)(now - lastReportMs) >= REPORT_INTERVAL_MS) {
    lastReportMs = now;
    reportTelemetry();
  }
  delay(20);
}
