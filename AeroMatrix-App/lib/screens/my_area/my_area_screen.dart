import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../models/air_quality.dart';
import '../../models/location.dart';
import '../../services/location_service.dart';
import '../../widgets/data_status_badge.dart';

class MyAreaScreen extends StatefulWidget {
  final LocationRepository locationService;

  const MyAreaScreen({
    super.key,
    required this.locationService,
  });

  @override
  State<MyAreaScreen> createState() => _MyAreaScreenState();
}

class _MyAreaScreenState extends State<MyAreaScreen> {
  LocationCategory _selectedCategory = LocationCategory.college;
  LocationItem? _selectedLocation;
  List<LocationItem> _currentCategoryLocations = [];
  List<LocationItem> _savedLocations = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final locations = await widget.locationService.getLocations(category: _selectedCategory);
    final saved = await widget.locationService.getSavedLocations();

    setState(() {
      _currentCategoryLocations = locations;
      _savedLocations = saved;
      // Default to Vishwakarma Institute of Technology if present, else first
      if (_selectedLocation == null || !locations.any((l) => l.id == _selectedLocation!.id)) {
        _selectedLocation = locations.firstWhere(
          (l) => l.name.contains('Vishwakarma'),
          orElse: () => locations.first,
        );
      } else {
        // refresh selected location object
        _selectedLocation = locations.firstWhere((l) => l.id == _selectedLocation!.id);
      }
    });
  }

  Future<void> _handleCategoryChanged(LocationCategory category) async {
    if (_selectedCategory == category) return;
    setState(() {
      _selectedCategory = category;
      _selectedLocation = null;
    });
    await _loadData();
  }

  Future<void> _handleToggleSave() async {
    if (_selectedLocation == null) return;
    await widget.locationService.toggleSaveLocation(_selectedLocation!.id);
    await _loadData();
    if (mounted) {
      final isSavedNow = _selectedLocation?.isSaved ?? false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(isSavedNow ? 'Added to My Places' : 'Removed from My Places'),
          duration: const Duration(seconds: 2),
        ),
      );
    }
  }

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
    return Scaffold(
      backgroundColor: AppColors.greenBackground,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top Section Title Banner
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'LOCALIZED AIR QUALITY',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.primaryGreen,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Explore Campuses & Micro-Locations',
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
            const SizedBox(height: 16),

            // Location Type Selector Tabs
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: LocationCategory.values.length,
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final cat = LocationCategory.values[index];
                  final isSelected = _selectedCategory == cat;
                  return ChoiceChip(
                    label: Text(cat.label),
                    selected: isSelected,
                    onSelected: (_) => _handleCategoryChanged(cat),
                    selectedColor: AppColors.primaryGreen,
                    backgroundColor: AppColors.cardWhite,
                    side: BorderSide(color: isSelected ? AppColors.primaryGreen : AppColors.cardBorder),
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : AppColors.textDark,
                      fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
                      fontSize: 13,
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 16),

            // Dropdown / Location Selector Container
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Select ${_selectedCategory.label}',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textMuted),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: AppColors.greenBackground,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.cardBorder),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<LocationItem>(
                          isExpanded: true,
                          value: _selectedLocation,
                          icon: const Icon(Icons.arrow_drop_down_rounded, color: AppColors.primaryGreen),
                          dropdownColor: AppColors.cardWhite,
                          items: _currentCategoryLocations.map((location) {
                            return DropdownMenuItem<LocationItem>(
                              value: location,
                              child: Text(
                                location.name,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: location.name.contains('Vishwakarma') ? FontWeight.w800 : FontWeight.w600,
                                  color: AppColors.textDark,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            );
                          }).toList(),
                          onChanged: (newVal) {
                            if (newVal != null) {
                              setState(() => _selectedLocation = newVal);
                            }
                          },
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Selected Location Details Card
            if (_selectedLocation != null) _buildSelectedLocationCard(_selectedLocation!),

            const SizedBox(height: 24),

            // MY PLACES (Saved Locations Comparison Section)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.bookmark_rounded, color: AppColors.primaryGreen, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'MY SAVED PLACES',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            color: AppColors.textDark,
                          ),
                    ),
                  ],
                ),
                Text(
                  '${_savedLocations.length} Saved',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),

            if (_savedLocations.isEmpty)
              Container(
                padding: const EdgeInsets.all(20),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.cardWhite,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.cardBorder),
                ),
                child: const Text(
                  'No saved places yet. Tap the bookmark icon above to save favorite locations.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              )
            else
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _savedLocations.length,
                separatorBuilder: (context, index) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final savedLoc = _savedLocations[index];
                  final qColor = _getQualityColor(savedLoc.qualityLevel);
                  final qBg = _getQualityBg(savedLoc.qualityLevel);

                  return Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      leading: CircleAvatar(
                        backgroundColor: qBg,
                        child: Icon(
                          savedLoc.category == LocationCategory.college
                              ? Icons.school_rounded
                              : savedLoc.category == LocationCategory.gardens
                                  ? Icons.park_rounded
                                  : Icons.business_rounded,
                          color: qColor,
                          size: 20,
                        ),
                      ),
                      title: Text(
                        savedLoc.name,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textDark),
                      ),
                      subtitle: Text(
                        savedLoc.area,
                        style: const TextStyle(fontSize: 11, color: AppColors.textMuted),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '${savedLoc.pm25.toInt()} µg/m³',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: qColor),
                          ),
                          Text(
                            savedLoc.qualityLevel.label,
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: qColor),
                          ),
                        ],
                      ),
                      onTap: () {
                        setState(() {
                          _selectedCategory = savedLoc.category;
                          _selectedLocation = savedLoc;
                        });
                      },
                    ),
                  );
                },
              ),

            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectedLocationCard(LocationItem location) {
    final level = location.qualityLevel;
    final statusColor = _getQualityColor(level);
    final statusBg = _getQualityBg(level);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title + Save bookmark button
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        location.name,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: AppColors.textDark,
                              fontSize: 16,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.place_outlined, size: 14, color: AppColors.primaryGreen),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              location.area,
                              style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(
                    location.isSaved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                    color: AppColors.primaryGreen,
                  ),
                  tooltip: location.isSaved ? 'Saved in My Places' : 'Save Location',
                  onPressed: _handleToggleSave,
                ),
              ],
            ),
            const SizedBox(height: 16),

            // PM2.5 & Air Quality Display
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: statusBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: statusColor.withValues(alpha: 0.3)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'PM2.5 Concentration',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textMuted),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '${location.pm25.toInt()}',
                            style: TextStyle(
                              fontSize: 38,
                              fontWeight: FontWeight.w900,
                              color: statusColor,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Text(
                            'µg/m³',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textMuted),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text(
                        'Air Quality',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textMuted),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        level.label,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: statusColor,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Secondary metrics grid (PM10, Temp, Humidity, Wind)
            Row(
              children: [
                _buildSmallMetricTile('PM10', '${location.pm10.toInt()} µg/m³', Icons.blur_on_rounded),
                const SizedBox(width: 8),
                _buildSmallMetricTile('Temp', '${location.temperature.toInt()}°C', Icons.thermostat_rounded),
                const SizedBox(width: 8),
                _buildSmallMetricTile('Humidity', '${location.humidity.toInt()}%', Icons.water_drop_rounded),
                const SizedBox(width: 8),
                _buildSmallMetricTile('Wind', '${location.windSpeed.toInt()} km/h', Icons.air_rounded),
              ],
            ),
            const SizedBox(height: 16),

            // Location description note
            Text(
              location.description,
              style: const TextStyle(fontSize: 12, color: AppColors.textDark, height: 1.35),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSmallMetricTile(String label, String value, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
        decoration: BoxDecoration(
          color: AppColors.greenBackground,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.cardBorder),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: AppColors.primaryGreen),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
            const SizedBox(height: 2),
            Text(
              value,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.textDark),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
