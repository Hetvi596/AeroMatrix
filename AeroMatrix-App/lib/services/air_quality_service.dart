import '../data/demo_air_quality.dart';
import '../models/air_quality.dart';

abstract class AirQualityRepository {
  Future<AirQualityData> getTodayAirQuality(String location);
  Future<AirQualityData> refreshAirQuality();
}

class DemoAirQualityService implements AirQualityRepository {
  AirQualityData _currentData = initialDemoAirQuality;

  @override
  Future<AirQualityData> getTodayAirQuality(String location) async {
    // Simulate brief network delay
    await Future.delayed(const Duration(milliseconds: 200));
    return _currentData;
  }

  @override
  Future<AirQualityData> refreshAirQuality() async {
    await Future.delayed(const Duration(milliseconds: 400));
    // Return simulated updated observation timestamp
    _currentData = AirQualityData(
      locationName: _currentData.locationName,
      timestamp: DateTime.now(),
      pm25: _currentData.pm25,
      pm10: _currentData.pm10,
      no2: _currentData.no2,
      o3: _currentData.o3,
      temperature: _currentData.temperature,
      humidity: _currentData.humidity,
      windSpeed: _currentData.windSpeed,
      compareYesterdayPercentage: _currentData.compareYesterdayPercentage,
      origin: DataOrigin.demo,
      hourlyTrend: _currentData.hourlyTrend,
    );
    return _currentData;
  }
}
