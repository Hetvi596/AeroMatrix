enum NotificationSeverity {
  info,
  warning,
  alert;
}

enum NotificationCategory {
  all('All'),
  airAlerts('Alerts'),
  weather('Weather'),
  traffic('Traffic');

  final String label;
  const NotificationCategory(this.label);
}

class PollutionNotification {
  final String id;
  final String iconEmoji;
  final String title;
  final String explanation;
  final String timeRange;
  final DateTime timestamp;
  final NotificationSeverity severity;
  final NotificationCategory category;
  final bool isRead;
  final String? relatedZoneOrLocation;

  PollutionNotification({
    required this.id,
    required this.iconEmoji,
    required this.title,
    required this.explanation,
    required this.timeRange,
    required this.timestamp,
    required this.severity,
    required this.category,
    this.isRead = false,
    this.relatedZoneOrLocation,
  });

  PollutionNotification copyWith({bool? isRead}) {
    return PollutionNotification(
      id: id,
      iconEmoji: iconEmoji,
      title: title,
      explanation: explanation,
      timeRange: timeRange,
      timestamp: timestamp,
      severity: severity,
      category: category,
      isRead: isRead ?? this.isRead,
      relatedZoneOrLocation: relatedZoneOrLocation,
    );
  }
}
