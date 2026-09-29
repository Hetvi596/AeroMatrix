import 'air_quality.dart';

class GreenZone {
  final String id;
  final String name;
  final String iconEmoji;
  final double pm25;
  final String greenCoverLevel; // e.g. "Dense Forest Canopy", "High Green Cover"
  final double distanceKm;
  final double freshAirScore; // out of 100
  final String areaLocation;
  final String highlight;
  final String bestTime;

  GreenZone({
    required this.id,
    required this.name,
    required this.iconEmoji,
    required this.pm25,
    required this.greenCoverLevel,
    required this.distanceKm,
    required this.freshAirScore,
    required this.areaLocation,
    required this.highlight,
    required this.bestTime,
  });

  AirQualityLevel get qualityLevel {
    if (pm25 <= 30) return AirQualityLevel.good;
    if (pm25 <= 60) return AirQualityLevel.moderate;
    if (pm25 <= 90) return AirQualityLevel.poor;
    if (pm25 <= 120) return AirQualityLevel.veryPoor;
    return AirQualityLevel.severe;
  }
}
