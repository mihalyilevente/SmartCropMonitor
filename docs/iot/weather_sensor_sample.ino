#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include "time.h"

const char* ssid = "";
const char* password = "";

const char* serverUrl = "http://46.225.7.134:8000/api/v1/sensors/sensor_data";
const char* sensorKey = "";

#define DHTPIN 4
#define DHTTYPE DHT22 
DHT dht(DHTPIN, DHTTYPE);

const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0;
const int   daylightOffset_sec = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
}

String getISO8601Time() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "1970-01-01T00:00:00Z";
  }
  char timeStringBuff[25];
  strftime(timeStringBuff, sizeof(timeStringBuff), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(timeStringBuff);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();

    if (isnan(h) || isnan(t)) {
      Serial.println("Failed to read from DHT sensor!");
      delay(2000);
      return;
    }

    StaticJsonDocument<512> doc;
    doc["key"] = sensorKey;
    
    JsonArray dataArray = doc.createNestedArray("data");
    JsonObject dataObj = dataArray.createNestedObject();
    
    dataObj["ts"] = getISO8601Time();
    dataObj["t"] = t;
    dataObj["p"] = 0; 
    dataObj["h"] = h;
    
    dataObj.createNestedObject("extra");

    String requestBody;
    serializeJson(doc, requestBody);

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    int httpResponseCode = http.POST(requestBody);

    if (httpResponseCode > 0) {
      Serial.printf("Response code: %d\n", httpResponseCode);
      String response = http.getString();
      Serial.println(response);
    } else {
      Serial.printf("Error occurred during HTTP request: %s\n", http.errorToString(httpResponseCode).c_str());
    }

    http.end();
  }

  delay(600000); 
}