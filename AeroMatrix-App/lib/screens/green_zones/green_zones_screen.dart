import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../data/demo_green_zones.dart';
import '../../models/green_zone.dart';
import '../../widgets/data_status_badge.dart';
import '../../widgets/green_zone_card.dart';

class GreenZonesScreen extends StatefulWidget {
  const GreenZonesScreen({super.key});

  @override
  State<GreenZonesScreen> createState() => _GreenZonesScreenState();
}

class _GreenZonesScreenState extends State<GreenZonesScreen> {
  String _activeFilter = 'All';
  List<GreenZone> _filteredZones = List.from(demoGreenZonesList);

  void _applyFilter(String filter) {
    setState(() {
      _activeFilter = filter;
      if (filter == 'All') {
        _filteredZones = List.from(demoGreenZonesList);
      } else if (filter == 'Nearest (<3km)') {
        _filteredZones = demoGreenZonesList.where((z) => z.distanceKm <= 3.0).toList();
      } else if (filter == 'Best Air Quality') {
        _filteredZones = demoGreenZonesList.where((z) => z.pm25 <= 32).toList();
      } else if (filter == 'Dense Canopy') {
        _filteredZones = demoGreenZonesList.where((z) => z.greenCoverLevel.contains('Forest') || z.greenCoverLevel.contains('Canopy')).toList();
      }
    });
  }

  void _showGreenZoneDetail(GreenZone zone) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: AppColors.cardWhite,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(color: AppColors.cardBorder, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Text(zone.iconEmoji, style: const TextStyle(fontSize: 32)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        zone.name,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: AppColors.textDark,
                            ),
                      ),
                      Text(
                        '${zone.areaLocation} • ${zone.distanceKm} km away',
                        style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Telemetry block
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.statusGoodBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.statusGood.withValues(alpha: 0.3)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  Column(
                    children: [
                      const Text('PM2.5 Level', style: TextStyle(fontSize: 11, color: AppColors.statusGood)),
                      const SizedBox(height: 2),
                      Text('${zone.pm25.toInt()} µg/m³', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.statusGood)),
                    ],
                  ),
                  Container(width: 1, height: 30, color: AppColors.statusGood.withValues(alpha: 0.2)),
                  Column(
                    children: [
                      const Text('Fresh Air Score', style: TextStyle(fontSize: 11, color: AppColors.statusGood)),
                      const SizedBox(height: 2),
                      Text('${zone.freshAirScore.toInt()}/100', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppColors.statusGood)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            const Text(
              'Environmental Highlights',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textDark),
            ),
            const SizedBox(height: 6),
            Text(
              zone.highlight,
              style: const TextStyle(fontSize: 13, color: AppColors.textMuted, height: 1.4),
            ),
            const SizedBox(height: 16),

            Row(
              children: [
                const Icon(Icons.wb_twilight_rounded, color: AppColors.primaryGreen, size: 18),
                const SizedBox(width: 8),
                Text(
                  'Optimal Visit Hours: ${zone.bestTime}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primaryGreenDark),
                ),
              ],
            ),
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.check_circle_outline_rounded),
                label: const Text('Close Details'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryGreen,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.greenBackground,
      body: Column(
        children: [
          // Header Banner
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: AppColors.cardWhite,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CLEAN AIR HAVENS',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.primaryGreen,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Nearby Low-Pollution Green Corridors',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textMuted),
                    ),
                  ],
                ),
                const DataStatusBadge(compact: true),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.cardBorder),

          // Filter bar
          Container(
            height: 52,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              children: ['All', 'Nearest (<3km)', 'Best Air Quality', 'Dense Canopy'].map((filter) {
                final isSelected = _activeFilter == filter;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(filter),
                    selected: isSelected,
                    onSelected: (_) => _applyFilter(filter),
                    selectedColor: AppColors.primaryGreen,
                    backgroundColor: AppColors.cardWhite,
                    side: BorderSide(color: isSelected ? AppColors.primaryGreen : AppColors.cardBorder),
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : AppColors.textDark,
                      fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                      fontSize: 12,
                    ),
                  ),
                );
              }).toList(),
            ),
          ),

          // Green Zone List
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _filteredZones.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final zone = _filteredZones[index];
                return GreenZoneCard(
                  greenZone: zone,
                  onTap: () => _showGreenZoneDetail(zone),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
