import 'package:shared_preferences/shared_preferences.dart';
import '../data/demo_locations.dart';
import '../models/location.dart';

abstract class LocationRepository {
  Future<List<LocationItem>> getLocations({LocationCategory? category});
  Future<LocationItem?> getLocationById(String id);
  Future<List<LocationItem>> getSavedLocations();
  Future<void> toggleSaveLocation(String locationId);
}

class DemoLocationService implements LocationRepository {
  static const String _savedPlacesKey = 'aerometrics_saved_locations_ids';
  List<LocationItem> _locations = List.from(demoLocationsList);

  @override
  Future<List<LocationItem>> getLocations({LocationCategory? category}) async {
    await _loadSavedState();
    if (category == null) return _locations;
    return _locations.where((loc) => loc.category == category).toList();
  }

  @override
  Future<LocationItem?> getLocationById(String id) async {
    await _loadSavedState();
    try {
      return _locations.firstWhere((loc) => loc.id == id);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<List<LocationItem>> getSavedLocations() async {
    await _loadSavedState();
    return _locations.where((loc) => loc.isSaved).toList();
  }

  @override
  Future<void> toggleSaveLocation(String locationId) async {
    final prefs = await SharedPreferences.getInstance();
    final savedIds = prefs.getStringList(_savedPlacesKey) ?? ['col_vit', 'gard_empress'];
    
    if (savedIds.contains(locationId)) {
      savedIds.remove(locationId);
    } else {
      savedIds.add(locationId);
    }
    
    await prefs.setStringList(_savedPlacesKey, savedIds);
    _updateInternalState(savedIds);
  }

  Future<void> _loadSavedState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedIds = prefs.getStringList(_savedPlacesKey) ?? ['col_vit', 'gard_empress', 'col_mit'];
      _updateInternalState(savedIds);
    } catch (_) {
      // Fallback if local storage unavailable
    }
  }

  void _updateInternalState(List<String> savedIds) {
    _locations = _locations.map((loc) {
      return loc.copyWith(isSaved: savedIds.contains(loc.id));
    }).toList();
  }
}
