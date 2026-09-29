import 'air_quality.dart';

class PollutionZone {
  final String id;
  final String name;
  final double centerLat;
  final double centerLng;
  final double radiusMeters;
  final double pm25;
  final double pm10;
  final double temperature;
  final String trafficStatus; // e.g. "Moderate", "Heavy"
  final String industrialInfluence; // e.g. "Low", "Significant"
  final String primaryContributor; // e.g. "Vehicular Exhaust", "Construction Dust"
  final String predictionSnippet; // e.g. "Peak PM2.5 expected between 18:00 - 21:00"

  PollutionZone({
    required this.id,
    required this.name,
    required this.centerLat,
    required this.centerLng,
    required this.radiusMeters,
    required this.pm25,
    required this.pm10,
    required this.temperature,
    required this.trafficStatus,
    required this.industrialInfluence,
    required this.primaryContributor,
    required this.predictionSnippet,
  });

  AirQualityLevel get qualityLevel {
    if (pm25 <= 30) return AirQualityLevel.good;
    if (pm25 <= 60) return AirQualityLevel.moderate;
    if (pm25 <= 90) return AirQualityLevel.poor;
    if (pm25 <= 120) return AirQualityLevel.veryPoor;
    return AirQualityLevel.severe;
  }
}
