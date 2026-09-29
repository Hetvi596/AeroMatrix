import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../models/notification.dart';

class NotificationCard extends StatelessWidget {
  final PollutionNotification notification;
  final VoidCallback? onDismiss;
  final VoidCallback? onTap;

  const NotificationCard({
    super.key,
    required this.notification,
    this.onDismiss,
    this.onTap,
  });

  Color _getSeverityColor(NotificationSeverity severity) {
    switch (severity) {
      case NotificationSeverity.info:
        return const Color(0xFF2E7D32);
      case NotificationSeverity.warning:
        return const Color(0xFFE65100);
      case NotificationSeverity.alert:
        return const Color(0xFFC62828);
    }
  }

  Color _getSeverityBg(NotificationSeverity severity) {
    switch (severity) {
      case NotificationSeverity.info:
        return const Color(0xFFE8F5E9);
      case NotificationSeverity.warning:
        return const Color(0xFFFFF3E0);
      case NotificationSeverity.alert:
        return const Color(0xFFFFEBEE);
    }
  }

  String _getSeverityLabel(NotificationSeverity severity) {
    switch (severity) {
      case NotificationSeverity.info:
        return 'Information';
      case NotificationSeverity.warning:
        return 'Warning';
      case NotificationSeverity.alert:
        return 'Alert';
    }
  }

  @override
  Widget build(BuildContext context) {
    final severityColor = _getSeverityColor(notification.severity);
    final severityBg = _getSeverityBg(notification.severity);

    return Dismissible(
      key: Key(notification.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) => onDismiss?.call(),
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(
          color: Colors.red.shade100,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.delete_outline_rounded, color: Colors.red),
      ),
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Emoji / Icon Container
                    Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: severityBg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: severityColor.withValues(alpha: 0.2)),
                      ),
                      child: Text(
                        notification.iconEmoji,
                        style: const TextStyle(fontSize: 22),
                      ),
                    ),
                    const SizedBox(width: 14),

                    // Title & Time Range
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  notification.title,
                                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.textDark,
                                      ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: severityBg,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  _getSeverityLabel(notification.severity),
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: severityColor,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            notification.explanation,
                            style: const TextStyle(
                              fontSize: 13,
                              color: AppColors.textDark,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 10),

                          Row(
                            children: [
                              const Icon(Icons.access_time_rounded, size: 14, color: AppColors.textMuted),
                              const SizedBox(width: 4),
                              Text(
                                notification.timeRange,
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textMuted,
                                ),
                              ),
                              if (notification.relatedZoneOrLocation != null) ...[
                                const SizedBox(width: 12),
                                const Icon(Icons.place_outlined, size: 14, color: AppColors.primaryGreen),
                                const SizedBox(width: 4),
                                Expanded(
                                  child: Text(
                                    notification.relatedZoneOrLocation!,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.primaryGreen,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
