# Graph Noise Investigation

## Root Cause

The noisy/stochastic chart behavior originated in the weather metrics pipeline.

1. `fetch_and_save_weather()` upserted `WeatherHistory` rows from Open-Meteo and reset
   `metrics_status` to `False` on every conflict, even when the weather values were
   unchanged.
2. `weather_metrics()` then recalculated those rows and inserted a new
   `WeatherMetrics` record every time.
3. `/api/v1/weather/location/{location_id}/weather-charts` joined
   `WeatherHistory` directly to all matching `WeatherMetrics` rows, so one timestamp
   could appear multiple times with different recalculation results.
4. `WeatherCharts.jsx` plotted points by array index rather than timestamp distance,
   so duplicate or delayed rows created artificial spikes and visually unstable
   trajectories.

## Affected Metrics And Components

- `WeatherCharts.jsx`
  - Weather tabs: temperature, humidity, precipitation, soil moisture, soil temperature,
    wind speed.
  - Agro tabs: GDD, 30d rain, ET0, 7d water deficit, solar radiation.
  - The agro tabs were most affected because they read from duplicated
    `WeatherMetrics` rows.
- `WeatherMetricsPanel.jsx`
  - Could select a non-deterministic metric row for the latest weather record when
    duplicates existed.
- Spraying and irrigation services
  - These consume `WeatherMetrics`; duplicate metric rows could make selected context
    depend on query order.
- Sensor sparklines
  - Less affected. Sensor data has a uniqueness constraint on `(sensor_id, timestamp)`,
    but delayed or out-of-order telemetry still benefits from frontend timestamp sorting.

## Reproduction

1. Pick a location with weather history and metrics.
2. Run the weather fetch and metric calculation twice without changing inputs:
   `fetch_and_save_weather(db, location)` followed by `weather_metrics(db, location)`.
3. Check for duplicated metrics:
   ```sql
   SELECT reference_weather_id, COUNT(*)
   FROM weather_metrics
   GROUP BY reference_weather_id
   HAVING COUNT(*) > 1;
   ```
4. Open the weather charts for that location. Metrics-backed tabs can show repeated
   timestamps, jumps, or changing line shapes after refresh.

## Fix

- Added an application-level upsert for `WeatherMetrics` keyed by
  `(location_id, reference_weather_id)`.
- Added a model uniqueness constraint for new database setups.
- Changed weather-history upsert logic so `metrics_status` only becomes `False` when
  weather input values actually change.
- Changed the chart endpoint to join only the latest metric row per weather record,
  which protects existing databases that already contain duplicates.
- Emitted chart timestamps as explicit UTC ISO strings.
- Normalized chart data in the frontend by parsing timestamps as UTC, sorting by time,
  de-duplicating repeated timestamps, and rendering x-positions by actual time distance.

## Existing Data Cleanup

For databases that already contain duplicate `weather_metrics` rows, the application now
reads only the latest row per weather record. A one-time cleanup can still be run later to
remove older duplicates after verifying backups.
