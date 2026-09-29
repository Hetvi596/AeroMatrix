import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../app/theme.dart';
import '../../data/demo_map.dart';
import '../../models/air_quality.dart';
import '../../models/pollution_zone.dart';
import '../../widgets/data_status_badge.dart';
import '../../widgets/pollution_zone_bottom_sheet.dart';

class PollutionMapScreen extends StatefulWidget {
  const PollutionMapScreen({super.key});

  @override
  State<PollutionMapScreen> createState() => _PollutionMapScreenState();
}

class _PollutionMapScreenState extends State<PollutionMapScreen> {
  final MapController _mapController = MapController();
  final LatLng _puneCenter = const LatLng(18.5204, 73.8567);
  PollutionZone? _selectedZone;
  bool _showLegend = true;

  Color _getZoneColor(AirQualityLevel level) {
    switch (level) {
      case AirQualityLevel.good:
        return const Color(0xFF2E7D32);
      case AirQualityLevel.moderate:
        return const Color(0xFFF57F17);
      case AirQualityLevel.poor:
        return const Color(0xFFE65100);
      case AirQualityLevel.veryPoor:
      case AirQualityLevel.severe:
        return const Color(0xFFC62828);
    }
  }

  void _onZoneTapped(PollutionZone zone) {
    setState(() => _selectedZone = zone);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => PollutionZoneBottomSheet(zone: zone),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.greenBackground,
      body: Stack(
        children: [
          // FlutterMap Tile Layer + Circle Markers
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _puneCenter,
              initialZoom: 12.4,
              maxZoom: 17.0,
              minZoom: 10.0,
            ),
            children: [
              // OpenStreetMap tile layer with smooth green-tint overlay
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.aerometrics.app',
              ),

              // Circle Overlays representing pollution zones
              CircleLayer(
                circles: demoPollutionZones.map((zone) {
                  final color = _getZoneColor(zone.qualityLevel);
                  final isSelected = _selectedZone?.id == zone.id;

                  return CircleMarker(
                    point: LatLng(zone.centerLat, zone.centerLng),
                    radius: zone.radiusMeters / 15, // Scale for view
                    useRadiusInMeter: false,
                    color: color.withValues(alpha: isSelected ? 0.45 : 0.28),
                    borderColor: color,
                    borderStrokeWidth: isSelected ? 3.5 : 2.0,
                  );
                }).toList(),
              ),

              // Interactive Marker Icons at Zone Centers
              MarkerLayer(
                markers: demoPollutionZones.map((zone) {
                  final color = _getZoneColor(zone.qualityLevel);

                  return Marker(
                    point: LatLng(zone.centerLat, zone.centerLng),
                    width: 70,
                    height: 50,
                    child: GestureDetector(
                      onTap: () => _onZoneTapped(zone),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: color, width: 2),
                              boxShadow: const [
                                BoxShadow(
                                  color: Colors.black12,
                                  blurRadius: 6,
                                  offset: Offset(0, 2),
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '${zone.pm25.toInt()}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.textDark,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),

          // Top Header Banner with DEMO MAP DATA label
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Card(
              elevation: 4,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.map_rounded, color: AppColors.primaryGreen, size: 18),
                            const SizedBox(width: 6),
                            Text(
                              'Pune Pollution Grid',
                              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textDark,
                                  ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Tap any zone circle to view modeled air telemetry',
                          style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                    const DataStatusBadge(origin: DataOrigin.demo, compact: true),
                  ],
                ),
              ),
            ),
          ),

          // Map Control Floating Buttons (Right Side)
          Positioned(
            right: 16,
            bottom: _showLegend ? 140 : 80,
            child: Column(
              children: [
                FloatingActionButton.small(
                  heroTag: 'recenter',
                  backgroundColor: AppColors.cardWhite,
                  foregroundColor: AppColors.primaryGreen,
                  child: const Icon(Icons.my_location_rounded),
                  onPressed: () {
                    _mapController.move(_puneCenter, 12.4);
                  },
                ),
                const SizedBox(height: 8),
                FloatingActionButton.small(
                  heroTag: 'legend_toggle',
                  backgroundColor: AppColors.cardWhite,
                  foregroundColor: AppColors.primaryGreen,
                  child: Icon(_showLegend ? Icons.layers_clear_rounded : Icons.layers_rounded),
                  onPressed: () {
                    setState(() => _showLegend = !_showLegend);
                  },
                ),
              ],
            ),
          ),

          // Pollution Intensity Legend Bar (Bottom Overlay)
          if (_showLegend)
            Positioned(
              left: 16,
              right: 16,
              bottom: 16,
              child: Card(
                elevation: 4,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'POLLUTION INTENSITY (PM2.5)',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.textMuted),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _buildLegendItem('Low (<30)', const Color(0xFF2E7D32)),
                          _buildLegendItem('Moderate (31-60)', const Color(0xFFF57F17)),
                          _buildLegendItem('Poor (61-90)', const Color(0xFFE65100)),
                          _buildLegendItem('Severe (>90)', const Color(0xFFC62828)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildLegendItem(String label, Color color) {
    return Expanded(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textDark),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
