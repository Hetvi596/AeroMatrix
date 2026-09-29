import 'package:flutter/material.dart';
import '../../app/theme.dart';
import '../../models/air_quality.dart';
import '../../services/air_quality_service.dart';
import '../../widgets/air_quality_card.dart';
import '../../widgets/metric_grid.dart';
import '../../widgets/trend_chart.dart';

class TodayAirQualityScreen extends StatefulWidget {
  final AirQualityRepository airQualityService;

  const TodayAirQualityScreen({
    super.key,
    required this.airQualityService,
  });

  @override
  State<TodayAirQualityScreen> createState() => _TodayAirQualityScreenState();
}

class _TodayAirQualityScreenState extends State<TodayAirQualityScreen> {
  late Future<AirQualityData> _airQualityFuture;
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() {
    setState(() {
      _airQualityFuture = widget.airQualityService.getTodayAirQuality('Pune');
    });
  }

  Future<void> _handleRefresh() async {
    setState(() {
      _isRefreshing = true;
    });
    await widget.airQualityService.refreshAirQuality();
    _loadData();
    setState(() {
      _isRefreshing = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _handleRefresh,
      color: AppColors.primaryGreen,
      child: FutureBuilder<AirQualityData>(
        future: _airQualityFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting && !_isRefreshing) {
            return const Center(
              child: CircularProgressIndicator(color: AppColors.primaryGreen),
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.cloud_off_rounded, size: 48, color: AppColors.statusPoor),
                    const SizedBox(height: 16),
                    Text(
                      'Unable to load environmental data.',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      onPressed: _loadData,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryGreen,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }

          final data = snapshot.data!;

          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top subtitle banner
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'TODAY\'S OVERVIEW',
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: AppColors.primaryGreen,
                                fontWeight: FontWeight.w800,
                              ),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Pune Metropolitan Region',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.refresh_rounded, color: AppColors.primaryGreen),
                      tooltip: 'Refresh Environmental Data',
                      onPressed: _handleRefresh,
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Main Air Quality Card
                MainAirQualityCard(
                  data: data,
                  onRefresh: _handleRefresh,
                ),
                const SizedBox(height: 16),

                // Detailed Environmental Indicators Grid
                AirQualityMetricsGrid(data: data),
                const SizedBox(height: 16),

                // Hourly Trend Chart
                TrendChartCard(trendData: data.hourlyTrend),
                const SizedBox(height: 20),
              ],
            ),
          );
        },
      ),
    );
  }
}
