import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../models/air_quality.dart';
import 'data_status_badge.dart';

class MainAirQualityCard extends StatelessWidget {
  final AirQualityData data;
  final VoidCallback? onRefresh;

  const MainAirQualityCard({
    super.key,
    required this.data,
    this.onRefresh,
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
    final level = data.qualityLevel;
    final statusColor = _getQualityColor(level);
    final statusBg = _getQualityBg(level);
    final isIncreased = data.compareYesterdayPercentage > 0;

    return Card(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white,
              AppColors.greenBackground.withValues(alpha: 0.5),
            ],
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0A1E5631),
              blurRadius: 16,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top location header & badge
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.location_on, color: AppColors.primaryGreen, size: 20),
                    const SizedBox(width: 6),
                    Text(
                      data.locationName,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.textDark,
                          ),
                    ),
                  ],
                ),
                DataStatusBadge(origin: data.origin, compact: true),
              ],
            ),
            const SizedBox(height: 18),

            // Main PM2.5 value & Quality Badge
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PM2.5',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.textMuted,
                            fontSize: 12,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          '${data.pm25.toInt()}',
                          style: const TextStyle(
                            fontSize: 54,
                            fontWeight: FontWeight.w900,
                            color: AppColors.textDark,
                            height: 1.0,
                          ),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'µg/m³',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textMuted.withValues(alpha: 0.9),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                // Quality pill badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(color: statusColor.withValues(alpha: 0.3), width: 1),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Air Quality',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: statusColor.withValues(alpha: 0.8),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        level.label,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: statusColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Visual Progress Meter
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: (data.pm25 / 150).clamp(0.0, 1.0),
                minHeight: 8,
                backgroundColor: AppColors.greenContainer,
                valueColor: AlwaysStoppedAnimation<Color>(statusColor),
              ),
            ),

            const SizedBox(height: 16),

            // Comparison indicator row
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.greenContainer.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    isIncreased ? Icons.arrow_upward_rounded : Icons.arrow_downward_rounded,
                    size: 16,
                    color: isIncreased ? AppColors.statusPoor : AppColors.statusGood,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${data.compareYesterdayPercentage.abs().toInt()}% ',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: isIncreased ? AppColors.statusPoor : AppColors.statusGood,
                    ),
                  ),
                  Text(
                    'compared with yesterday',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.textMuted.withValues(alpha: 0.9),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
