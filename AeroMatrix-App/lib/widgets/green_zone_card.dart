import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../models/green_zone.dart';

class GreenZoneCard extends StatelessWidget {
  final GreenZone greenZone;
  final VoidCallback? onTap;

  const GreenZoneCard({
    super.key,
    required this.greenZone,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.statusGoodBg,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.statusGood.withValues(alpha: 0.3)),
                    ),
                    child: Text(
                      greenZone.iconEmoji,
                      style: const TextStyle(fontSize: 24),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          greenZone.name,
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: AppColors.textDark,
                              ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(Icons.near_me_outlined, size: 12, color: AppColors.textMuted),
                            const SizedBox(width: 4),
                            Text(
                              '${greenZone.areaLocation} • ',
                              style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                            ),
                            Text(
                              '${greenZone.distanceKm} km away',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primaryGreen,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Air Quality Pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.statusGoodBg,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.statusGood.withValues(alpha: 0.3)),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'PM2.5',
                          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.statusGood),
                        ),
                        Text(
                          '${greenZone.pm25.toInt()}',
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: AppColors.statusGood),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              Text(
                greenZone.highlight,
                style: const TextStyle(fontSize: 13, color: AppColors.textDark, height: 1.3),
              ),
              const SizedBox(height: 12),

              // Bottom details chips
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.greenContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.park_rounded, size: 14, color: AppColors.primaryGreen),
                        const SizedBox(width: 4),
                        Text(
                          greenZone.greenCoverLevel,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.primaryGreenDark),
                        ),
                      ],
                    ),
                  ),

                  Row(
                    children: [
                      const Icon(Icons.wb_twilight_rounded, size: 13, color: AppColors.textMuted),
                      const SizedBox(width: 4),
                      Text(
                        greenZone.bestTime,
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
