import '../models/air_quality.dart';

final AirQualityData initialDemoAirQuality = AirQualityData(
  locationName: 'Pune — Today',
  timestamp: DateTime.now(),
  pm25: 68.0,
  pm10: 91.0,
  no2: 34.0,
  o3: 28.0,
  temperature: 27.0,
  humidity: 71.0,
  windSpeed: 8.0,
  compareYesterdayPercentage: 12.0, // ↑ 12% compared with yesterday
  origin: DataOrigin.demo,
  hourlyTrend: [
    HourlyTrendPoint(timeLabel: '06:00', pm25: 52, pm10: 74),
    HourlyTrendPoint(timeLabel: '09:00', pm25: 62, pm10: 82),
    HourlyTrendPoint(timeLabel: '12:00', pm25: 68, pm10: 91),
    HourlyTrendPoint(timeLabel: '15:00', pm25: 75, pm10: 98),
    HourlyTrendPoint(timeLabel: '18:00', pm25: 84, pm10: 110),
    HourlyTrendPoint(timeLabel: '21:00', pm25: 72, pm10: 94),
    HourlyTrendPoint(timeLabel: '23:59', pm25: 62, pm10: 80),
  ],
);
