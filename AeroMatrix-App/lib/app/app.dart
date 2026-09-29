import 'package:flutter/material.dart';
import '../services/air_quality_service.dart';
import '../services/location_service.dart';
import '../services/notification_service.dart';
import '../screens/shell/app_shell.dart';
import '../screens/splash/splash_screen.dart';
import 'theme.dart';

class AerometricsApp extends StatefulWidget {
  final AirQualityRepository airQualityService;
  final NotificationRepository notificationService;
  final LocationRepository locationService;

  const AerometricsApp({
    super.key,
    required this.airQualityService,
    required this.notificationService,
    required this.locationService,
  });

  @override
  State<AerometricsApp> createState() => _AerometricsAppState();
}

class _AerometricsAppState extends State<AerometricsApp> {
  bool _showSplash = true;

  void _onSplashFinished() {
    setState(() {
      _showSplash = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AEROMETRICS — Urban Environmental Intelligence',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: AnimatedSwitcher(
        duration: const Duration(milliseconds: 600),
        switchInCurve: Curves.easeIn,
        switchOutCurve: Curves.easeOut,
        child: _showSplash
            ? SplashScreen(
                key: const ValueKey('splash'),
                onSplashComplete: _onSplashFinished,
              )
            : AppShell(
                key: const ValueKey('shell'),
                airQualityService: widget.airQualityService,
                notificationService: widget.notificationService,
                locationService: widget.locationService,
              ),
      ),
    );
  }
}
