import 'package:flutter/material.dart';
import 'app/app.dart';
import 'services/air_quality_service.dart';
import 'services/location_service.dart';
import 'services/notification_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Instantiate service repositories
  final airQualityService = DemoAirQualityService();
  final notificationService = SyntheticNotificationEngine();
  final locationService = DemoLocationService();

  runApp(
    AerometricsApp(
      airQualityService: airQualityService,
      notificationService: notificationService,
      locationService: locationService,
    ),
  );
}
