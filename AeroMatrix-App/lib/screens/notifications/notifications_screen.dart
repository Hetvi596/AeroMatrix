import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../models/notification.dart';
import '../../services/notification_service.dart';
import '../../widgets/data_status_badge.dart';
import '../../widgets/notification_card.dart';

class SmartNotificationsScreen extends StatefulWidget {
  final NotificationRepository notificationService;

  const SmartNotificationsScreen({
    super.key,
    required this.notificationService,
  });

  @override
  State<SmartNotificationsScreen> createState() => _SmartNotificationsScreenState();
}

class _SmartNotificationsScreenState extends State<SmartNotificationsScreen> {
  NotificationCategory _selectedCategory = NotificationCategory.all;
  late Future<List<PollutionNotification>> _notificationsFuture;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  void _loadNotifications() {
    setState(() {
      _notificationsFuture = widget.notificationService.getNotifications(category: _selectedCategory);
    });
  }

  void _handleCategoryChange(NotificationCategory category) {
    if (_selectedCategory == category) return;
    setState(() {
      _selectedCategory = category;
    });
    _loadNotifications();
  }

  Future<void> _handleDismiss(String id) async {
    await widget.notificationService.dismissNotification(id);
    _loadNotifications();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Notification dismissed'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.greenBackground,
      body: Column(
        children: [
          // Subheader banner
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
                      'AI ENVIRONMENTAL ADVISORIES',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.primaryGreen,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Modeled Pollution & Weather Events',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
                const DataStatusBadge(compact: true),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.cardBorder),

          // Filter chips row
          Container(
            height: 54,
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: NotificationCategory.values.length,
              separatorBuilder: (context, index) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final category = NotificationCategory.values[index];
                final isSelected = _selectedCategory == category;
                return ChoiceChip(
                  label: Text(category.label),
                  selected: isSelected,
                  onSelected: (_) => _handleCategoryChange(category),
                  selectedColor: AppColors.primaryGreen,
                  backgroundColor: AppColors.cardWhite,
                  side: BorderSide(
                    color: isSelected ? AppColors.primaryGreen : AppColors.cardBorder,
                  ),
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : AppColors.textDark,
                    fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                    fontSize: 13,
                  ),
                );
              },
            ),
          ),

          // Notification List
          Expanded(
            child: FutureBuilder<List<PollutionNotification>>(
              future: _notificationsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(
                    child: CircularProgressIndicator(color: AppColors.primaryGreen),
                  );
                }

                if (snapshot.hasError) {
                  return const Center(child: Text('Error loading notifications'));
                }

                final notifications = snapshot.data ?? [];

                if (notifications.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.notifications_off_outlined, size: 54, color: AppColors.textMuted),
                        const SizedBox(height: 16),
                        Text(
                          'No alerts in this category.',
                          style: Theme.of(context).textTheme.titleSmall?.copyWith(color: AppColors.textMuted),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Environmental conditions are clear.',
                          style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: notifications.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final notif = notifications[index];
                    return NotificationCard(
                      notification: notif,
                      onDismiss: () => _handleDismiss(notif.id),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
