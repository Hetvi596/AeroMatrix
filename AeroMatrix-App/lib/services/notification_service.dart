import '../data/demo_notifications.dart';
import '../models/notification.dart';

abstract class NotificationRepository {
  Future<List<PollutionNotification>> getNotifications({NotificationCategory category = NotificationCategory.all});
  Future<void> markAsRead(String notificationId);
  Future<void> dismissNotification(String notificationId);
}

class SyntheticNotificationEngine implements NotificationRepository {
  List<PollutionNotification> _notifications = List.from(demoNotificationsList);

  @override
  Future<List<PollutionNotification>> getNotifications({NotificationCategory category = NotificationCategory.all}) async {
    await Future.delayed(const Duration(milliseconds: 150));
    if (category == NotificationCategory.all) {
      return List.unmodifiable(_notifications);
    }
    return List.unmodifiable(_notifications.where((n) => n.category == category));
  }

  @override
  Future<void> markAsRead(String notificationId) async {
    _notifications = _notifications.map((n) {
      if (n.id == notificationId) {
        return n.copyWith(isRead: true);
      }
      return n;
    }).toList();
  }

  @override
  Future<void> dismissNotification(String notificationId) async {
    _notifications.removeWhere((n) => n.id == notificationId);
  }
}
