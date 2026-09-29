import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../services/air_quality_service.dart';
import '../../services/location_service.dart';
import '../../services/notification_service.dart';
import '../green_zones/green_zones_screen.dart';
import '../home/today_air_quality_screen.dart';
import '../my_area/my_area_screen.dart';
import '../notifications/notifications_screen.dart';
import '../pollution_map/pollution_map_screen.dart';
import 'nav_drawer.dart';

class AppShell extends StatefulWidget {
  final AirQualityRepository airQualityService;
  final NotificationRepository notificationService;
  final LocationRepository locationService;

  const AppShell({
    super.key,
    required this.airQualityService,
    required this.notificationService,
    required this.locationService,
  });

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _currentNavIndex = 0;
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  late final List<Widget> _pages;

  @override
  void initState() {
    super.initState();
    _pages = [
      TodayAirQualityScreen(airQualityService: widget.airQualityService),
      SmartNotificationsScreen(notificationService: widget.notificationService),
      MyAreaScreen(locationService: widget.locationService),
      const PollutionMapScreen(),
      const GreenZonesScreen(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      drawer: AppNavDrawer(
        selectedIndex: _currentNavIndex,
        onItemSelected: (index) {
          setState(() => _currentNavIndex = index);
        },
      ),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.menu_rounded, size: 26),
          tooltip: 'Open Drawer Menu',
          onPressed: () => _scaffoldKey.currentState?.openDrawer(),
        ),
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.greenContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.eco_rounded, color: AppColors.primaryGreen, size: 18),
            ),
            const SizedBox(width: 8),
            Text(
              'AEROMETRICS',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: AppColors.primaryGreen,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.2,
                    fontSize: 18,
                  ),
            ),
          ],
        ),
        centerTitle: true,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: CircleAvatar(
              radius: 16,
              backgroundColor: AppColors.greenContainer,
              child: Text(
                '${_currentNavIndex + 1}',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryGreenDark,
                ),
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentNavIndex,
        children: _pages,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentNavIndex,
        onDestinationSelected: (index) {
          setState(() => _currentNavIndex = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.air_rounded),
            selectedIcon: Icon(Icons.air_rounded, color: AppColors.primaryGreen),
            label: 'Today',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_none_rounded),
            selectedIcon: Icon(Icons.notifications_active_rounded, color: AppColors.primaryGreen),
            label: 'Advisories',
          ),
          NavigationDestination(
            icon: Icon(Icons.my_location_outlined),
            selectedIcon: Icon(Icons.my_location_rounded, color: AppColors.primaryGreen),
            label: 'My Area',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map_rounded, color: AppColors.primaryGreen),
            label: 'Map',
          ),
          NavigationDestination(
            icon: Icon(Icons.park_outlined),
            selectedIcon: Icon(Icons.park_rounded, color: AppColors.primaryGreen),
            label: 'Green Zones',
          ),
        ],
      ),
    );
  }
}
