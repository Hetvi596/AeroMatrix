import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../models/air_quality.dart';
import '../models/pollution_zone.dart';
import 'data_status_badge.dart';

class PollutionZoneBottomSheet extends StatelessWidget {
  final PollutionZone zone;

  const PollutionZoneBottomSheet({
    super.key,
    required this.zone,
  });

  Color _getQualityColor(AirQualityLevel level) {
    switch (level) {
      case AirQualityLevel.good:
        return AppColors.statusGood;
      case AirQualityLevel.moderate:
        return AppColors.statusModerate;
      case AirQualityLevel.poor:
        return AppColors.statusPoor;
      case AirQualityLevel.veryPoor:
        return AppColors.statusVeryPoor;
      case AirQualityLevel.severe:
        return AppColors.statusSevere;
    }
  }

  Color _getQualityBg(AirQualityLevel level) {
    switch (level) {
      case AirQualityLevel.good:
        return AppColors.statusGoodBg;
      case AirQualityLevel.moderate:
        return AppColors.statusModerateBg;
      case AirQualityLevel.poor:
        return AppColors.statusPoorBg;
      case AirQualityLevel.veryPoor:
        return AppColors.statusVeryPoorBg;
      case AirQualityLevel.severe:
        return AppColors.statusSevereBg;
    }
  }

  @override
  Widget build(BuildContext context) {
    final level = zone.qualityLevel;
    final color = _getQualityColor(level);
    final bg = _getQualityBg(level);

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        color: AppColors.cardWhite,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drag handle bar
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.cardBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 18),

          // Header with Zone ID & Name
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.greenContainer,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            zone.id,
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: AppColors.primaryGreenDark,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        const DataStatusBadge(origin: DataOrigin.demo, compact: true),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      zone.name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.textDark,
                          ),
                    ),
                  ],
                ),
              ),

              // Air Quality Level Badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: bg,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: color.withValues(alpha: 0.3)),
                ),
                child: Text(
                  level.label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 20),

          // Key metrics row
          Row(
            children: [
              Expanded(
                child: _buildMetricTile(
                  context,
                  label: 'PM2.5',
                  value: '${zone.pm25.toInt()} µg/m³',
                  icon: Icons.grain_rounded,
                  color: color,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMetricTile(
                  context,
                  label: 'PM10',
                  value: '${zone.pm10.toInt()} µg/m³',
                  icon: Icons.blur_on_rounded,
                  color: AppColors.statusModerate,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildMetricTile(
                  context,
                  label: 'Temp',
                  value: '${zone.temperature.toInt()}°C',
                  icon: Icons.thermostat_rounded,
                  color: const Color(0xFFD35400),
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Environmental Factors
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.greenBackground,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.cardBorder),
            ),
            child: Column(
              children: [
                _buildFactorRow(
                  icon: Icons.directions_car_rounded,
                  label: 'Traffic Density',
                  value: zone.trafficStatus,
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Divider(height: 1, color: AppColors.cardBorder),
                ),
                _buildFactorRow(
                  icon: Icons.factory_rounded,
                  label: 'Industrial Activity',
                  value: zone.industrialInfluence,
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Divider(height: 1, color: AppColors.cardBorder),
                ),
                _buildFactorRow(
                  icon: Icons.source_rounded,
                  label: 'Primary Source',
                  value: zone.primaryContributor,
                ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Prediction Banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.greenContainer,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.psychology_alt_rounded, color: AppColors.primaryGreen, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    zone.predictionSnippet,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primaryGreenDark,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
      ),
    );
  }

  Widget _buildMetricTile(
    BuildContext context, {
    required String label,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: AppColors.greenBackground,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.textMuted, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textDark),
          ),
        ],
      ),
    );
  }

  Widget _buildFactorRow({required IconData icon, required String label, required String value}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Icon(icon, size: 16, color: AppColors.textMuted),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textMuted),
            ),
          ],
        ),
        Text(
          value,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textDark),
        ),
      ],
    );
  }
}
