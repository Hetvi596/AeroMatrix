enum AirQualityLevel {
  good,
  moderate,
  poor,
  veryPoor,
  severe;

  String get label {
    switch (this) {
      case AirQualityLevel.good:
        return 'Good';
      case AirQualityLevel.moderate:
        return 'Moderate';
      case AirQualityLevel.poor:
        return 'Poor';
      case AirQualityLevel.veryPoor:
        return 'Very Poor';
      case AirQualityLevel.severe:
        return 'Severe';
    }
  }

  String get description {
    switch (this) {
      case AirQualityLevel.good:
        return 'Air quality is satisfactory with little to no risk.';
      case AirQualityLevel.moderate:
        return 'Acceptable air quality; sensitive individuals should take care.';
      case AirQualityLevel.poor:
        return 'Unhealthy for sensitive groups; slight breathing discomfort possible.';
      case AirQualityLevel.veryPoor:
        return 'Health alert: everyone may experience health effects.';
      case AirQualityLevel.severe:
        return 'Emergency conditions: serious risk for the entire population.';
    }
  }
}

enum DataOrigin {
  demo('DEMO DATA'),
  simulated('SIMULATED DATA'),
  observed('OBSERVED DATA'),
  mlPrediction('MODEL PREDICTION'),
  modeledScenario('MODELED SCENARIO');

  final String label;
  const DataOrigin(this.label);
}

class HourlyTrendPoint {
  final String timeLabel; // e.g. "06:00"
  final double pm25;
  final double pm10;

  HourlyTrendPoint({
    required this.timeLabel,
    required this.pm25,
    required this.pm10,
  });
}

class AirQualityData {
  final String locationName;
  final DateTime timestamp;
  final double pm25; // µg/m³
  final double pm10; // µg/m³
  final double no2; // ppb
  final double o3; // ppb
  final double temperature; // °C
  final double humidity; // %
  final double windSpeed; // km/h
  final double compareYesterdayPercentage; // positive means increase
  final DataOrigin origin;
  final List<HourlyTrendPoint> hourlyTrend;

  AirQualityData({
    required this.locationName,
    required this.timestamp,
    required this.pm25,
    required this.pm10,
    required this.no2,
    required this.o3,
    required this.temperature,
    required this.humidity,
    required this.windSpeed,
    required this.compareYesterdayPercentage,
    this.origin = DataOrigin.demo,
    required this.hourlyTrend,
  });

  AirQualityLevel get qualityLevel {
    if (pm25 <= 30) return AirQualityLevel.good;
    if (pm25 <= 60) return AirQualityLevel.moderate;
    if (pm25 <= 90) return AirQualityLevel.poor;
    if (pm25 <= 120) return AirQualityLevel.veryPoor;
    return AirQualityLevel.severe;
  }
}
