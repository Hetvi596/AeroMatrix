import 'package:flutter/material.dart';
import '../../app/theme.dart';

class NavigationItem {
  final int index;
  final String title;
  final IconData icon;

  const NavigationItem({
    required this.index,
    required this.title,
    required this.icon,
  });
}

class AppNavDrawer extends StatelessWidget {
  final int selectedIndex;
  final ValueChanged<int> onItemSelected;

  const AppNavDrawer({
    super.key,
    required this.selectedIndex,
    required this.onItemSelected,
  });

  static const List<NavigationItem> navItems = [
    NavigationItem(
      index: 0,
      title: "Today's Air Quality",
      icon: Icons.air_rounded,
    ),
    NavigationItem(
      index: 1,
      title: "Smart Pollution Notifications",
      icon: Icons.notifications_active_rounded,
    ),
    NavigationItem(
      index: 2,
      title: "My Area",
      icon: Icons.my_location_rounded,
    ),
    NavigationItem(
      index: 3,
      title: "Pollution Map",
      icon: Icons.map_rounded,
    ),
    NavigationItem(
      index: 4,
      title: "Green & Healthy Zones",
      icon: Icons.park_rounded,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            // Drawer Header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                color: AppColors.greenBackground,
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(20)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: AppColors.primaryGreen,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(Icons.eco_rounded, color: Colors.white, size: 28),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'AEROMETRICS',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w900,
                                    color: AppColors.primaryGreen,
                                    letterSpacing: 1.5,
                                  ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Urban Environmental Intelligence',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: AppColors.textMuted,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 11,
                                  ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Data Mode Pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.greenContainer,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.primaryGreen.withValues(alpha: 0.2)),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.hub_outlined, size: 14, color: AppColors.primaryGreen),
                        SizedBox(width: 6),
                        Text(
                          'SYNTHETIC DIGITAL TWIN',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryGreenDark,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Navigation Items
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: navItems.length,
                separatorBuilder: (context, index) => const SizedBox(height: 4),
                itemBuilder: (context, index) {
                  final item = navItems[index];
                  final isSelected = selectedIndex == item.index;

                  return Container(
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.greenContainer : Colors.transparent,
                      borderRadius: BorderRadius.circular(16),
                      border: isSelected
                          ? Border.all(color: AppColors.primaryGreen.withValues(alpha: 0.3), width: 1)
                          : null,
                    ),
                    child: ListTile(
                      leading: Icon(
                        item.icon,
                        color: isSelected ? AppColors.primaryGreen : AppColors.textMuted,
                        size: 22,
                      ),
                      title: Text(
                        item.title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                          color: isSelected ? AppColors.primaryGreenDark : AppColors.textDark,
                        ),
                      ),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      trailing: isSelected
                          ? Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: AppColors.primaryGreen,
                                shape: BoxShape.circle,
                              ),
                            )
                          : null,
                      onTap: () {
                        onItemSelected(item.index);
                        Navigator.pop(context); // Close drawer
                      },
                    ),
                  );
                },
              ),
            ),

            // Footer note
            const Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                'Aerometrics v1.0.0 (Prototype)\nPune Environmental Twin',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 11,
                  color: AppColors.textMuted,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
