import 'air_quality.dart';

enum LocationCategory {
  college('Colleges'),
  hotels('Hotels'),
  gardens('Gardens'),
  otherPlaces('Other Places');

  final String label;
  const LocationCategory(this.label);
}

class LocationItem {
  final String id;
  final String name;
  final LocationCategory category;
  final String area;
  final double latitude;
  final double longitude;
  final double pm25;
  final double pm10;
  final double temperature;
  final double humidity;
  final double windSpeed;
  final String description;
  final bool isSaved;

  LocationItem({
    required this.id,
    required this.name,
    required this.category,
    required this.area,
    required this.latitude,
    required this.longitude,
    required this.pm25,
    required this.pm10,
    required this.temperature,
    required this.humidity,
    required this.windSpeed,
    required this.description,
    this.isSaved = false,
  });

  AirQualityLevel get qualityLevel {
    if (pm25 <= 30) return AirQualityLevel.good;
    if (pm25 <= 60) return AirQualityLevel.moderate;
    if (pm25 <= 90) return AirQualityLevel.poor;
    if (pm25 <= 120) return AirQualityLevel.veryPoor;
    return AirQualityLevel.severe;
  }

  LocationItem copyWith({bool? isSaved}) {
    return LocationItem(
      id: id,
      name: name,
      category: category,
      area: area,
      latitude: latitude,
      longitude: longitude,
      pm25: pm25,
      pm10: pm10,
      temperature: temperature,
      humidity: humidity,
      windSpeed: windSpeed,
      description: description,
      isSaved: isSaved ?? this.isSaved,
    );
  }
}
