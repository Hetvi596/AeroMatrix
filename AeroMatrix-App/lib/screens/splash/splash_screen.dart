import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../app/theme.dart';

class SplashScreen extends StatefulWidget {
  final VoidCallback onSplashComplete;

  const SplashScreen({
    super.key,
    required this.onSplashComplete,
  });

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late AnimationController _mainController;
  late AnimationController _breezeController;

  late Animation<double> _logoScale;
  late Animation<double> _logoOpacity;
  late Animation<double> _textFade;
  late Animation<double> _taglineFade;

  @override
  void initState() {
    super.initState();

    _breezeController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();

    _mainController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );

    _logoScale = Tween<double>(begin: 0.7, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.2, 0.7, curve: Curves.easeOutBack),
      ),
    );

    _logoOpacity = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.1, 0.5, curve: Curves.easeIn),
      ),
    );

    _textFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.4, 0.8, curve: Curves.easeIn),
      ),
    );

    _taglineFade = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _mainController,
        curve: const Interval(0.6, 0.95, curve: Curves.easeIn),
      ),
    );

    _mainController.forward();

    // Transition to main dashboard after 2.3s target duration
    Future.delayed(const Duration(milliseconds: 2300), () {
      if (mounted) {
        widget.onSplashComplete();
      }
    });
  }

  @override
  void dispose() {
    _mainController.dispose();
    _breezeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.greenBackground,
      body: Stack(
        children: [
          // Environmental wave / particle background animation
          AnimatedBuilder(
            animation: _breezeController,
            builder: (context, child) {
              return CustomPaint(
                size: Size.infinite,
                painter: BreezeParticlePainter(progress: _breezeController.value),
              );
            },
          ),

          // Central logo reveal sequence
          Center(
            child: AnimatedBuilder(
              animation: _mainController,
              builder: (context, child) {
                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Logo Icon with animated scale & opacity
                    Transform.scale(
                      scale: _logoScale.value,
                      child: Opacity(
                        opacity: _logoOpacity.value,
                        child: Container(
                          width: 96,
                          height: 96,
                          decoration: BoxDecoration(
                            color: AppColors.primaryGreen,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: AppColors.primaryGreen.withValues(alpha: 0.3),
                                blurRadius: 24,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.eco_rounded,
                            size: 52,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // AEROMETRICS Title
                    Opacity(
                      opacity: _textFade.value,
                      child: Text(
                        'AEROMETRICS',
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              color: AppColors.primaryGreen,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 4.0,
                            ),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Tagline
                    Opacity(
                      opacity: _taglineFade.value,
                      child: Text(
                        'Understand the Air Around You.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: AppColors.textMuted,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.8,
                            ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),

          // Bottom Twin branding label
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Opacity(
              opacity: _taglineFade.value,
              child: Column(
                children: [
                  Text(
                    'URBAN ENVIRONMENTAL DIGITAL TWIN',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.5,
                      color: AppColors.primaryGreen.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class BreezeParticlePainter extends CustomPainter {
  final double progress;

  BreezeParticlePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final paintLine = Paint()
      ..color = AppColors.primaryGreen.withValues(alpha: 0.08)
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke;

    final paintLeaf = Paint()
      ..color = AppColors.primaryGreenLight.withValues(alpha: 0.12)
      ..style = PaintingStyle.fill;

    // Draw flowing atmospheric breeze lines
    final path1 = Path();
    final y1 = size.height * 0.35 + math.sin(progress * 2 * math.pi) * 20;
    path1.moveTo(0, y1);
    path1.cubicTo(
      size.width * 0.3, y1 - 40,
      size.width * 0.7, y1 + 40,
      size.width, y1 - 20,
    );
    canvas.drawPath(path1, paintLine);

    final path2 = Path();
    final y2 = size.height * 0.65 + math.cos(progress * 2 * math.pi) * 25;
    path2.moveTo(0, y2);
    path2.cubicTo(
      size.width * 0.4, y2 + 35,
      size.width * 0.8, y2 - 35,
      size.width, y2 + 10,
    );
    canvas.drawPath(path2, paintLine);

    // Draw floating leaf particles
    for (int i = 0; i < 6; i++) {
      final floatX = (size.width * (0.15 + i * 0.16) + progress * 60) % size.width;
      final floatY = size.height * (0.2 + (i % 3) * 0.25) + math.sin(progress * 2 * math.pi + i) * 15;
      canvas.drawCircle(Offset(floatX, floatY), 4 + (i % 3).toDouble(), paintLeaf);
    }
  }

  @override
  bool shouldRepaint(covariant BreezeParticlePainter oldDelegate) => oldDelegate.progress != progress;
}
