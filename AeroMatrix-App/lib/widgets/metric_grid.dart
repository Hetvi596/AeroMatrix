import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../models/air_quality.dart';

class MetricTileItem {
  final String label;
  final String value;
  final String unit;
  final IconData icon;
  final Color color;

  MetricTileItem({
    required this.label,
    required this.value,
    required this.unit,
    required this.icon,
    required this.color,
  });
}

class AirQualityMetricsGrid extends StatelessWidget {
  final AirQualityData data;

  const AirQualityMetricsGrid({
    super.key,
    required this.data,
  });

  @override
  Widget build(BuildContext context) {
    final List<MetricTileItem> metrics = [
      MetricTileItem(
        label: 'PM2.5',
        value: '${data.pm25.toInt()}',
        unit: 'µg/m³',
        icon: Icons.grain_rounded,
        color: AppColors.statusPoor,
      ),
      MetricTileItem(
        label: 'PM10',
        value: '${data.pm10.toInt()}',
        unit: 'µg/m³',
        icon: Icons.blur_on_rounded,
        color: AppColors.statusModerate,
      ),
      MetricTileItem(
        label: 'NO₂',
        value: '${data.no2.toInt()}',
        unit: 'ppb',
        icon: Icons.co2_rounded,
        color: AppColors.primaryGreen,
      ),
      MetricTileItem(
        label: 'O₃',
        value: '${data.o3.toInt()}',
        unit: 'ppb',
        icon: Icons.cloud_rounded,
        color: AppColors.primaryGreenLight,
      ),
      MetricTileItem(
        label: 'Temperature',
        value: '${data.temperature.toInt()}',
        unit: '°C',
        icon: Icons.thermostat_rounded,
        color: const Color(0xFFD35400),
      ),
      MetricTileItem(
        label: 'Humidity',
        value: '${data.humidity.toInt()}',
        unit: '%',
        icon: Icons.water_drop_rounded,
        color: const Color(0xFF2980B9),
      ),
      MetricTileItem(
        label: 'Wind',
        value: '${data.windSpeed.toInt()}',
        unit: 'km/h',
        icon: Icons.air_rounded,
        color: AppColors.primaryGreen,
      ),
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.grid_view_rounded, size: 18, color: AppColors.primaryGreen),
                    const SizedBox(width: 8),
                    Text(
                      'Environmental Indicators',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: AppColors.textDark,
                          ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.greenContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'DEMO DATA',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryGreenDark,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Grid of indicators
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: metrics.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 2.3,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
              ),
              itemBuilder: (context, index) {
                final item = metrics[index];
                return Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.greenBackground,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.cardBorder.withValues(alpha: 0.8)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: item.color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(item.icon, color: item.color, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              item.label,
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textMuted,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 2),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Text(
                                  item.value,
                                  style: const TextStyle(
                                    fontSize: 18,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textDark,
                                  ),
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  item.unit,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
