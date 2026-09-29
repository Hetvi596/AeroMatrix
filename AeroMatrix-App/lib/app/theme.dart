import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Primary Nature Greens
  static const Color primaryGreen = Color(0xFF1E5631);      // Deep Nature Green
  static const Color primaryGreenDark = Color(0xFF11381E);  // Forest Dark Green
  static const Color primaryGreenLight = Color(0xFF3B8354); // Lush Green Accent
  
  // Secondary Light Green Backgrounds
  static const Color greenContainer = Color(0xFFEAF3ED);    // Light Sage Card fill
  static const Color greenBackground = Color(0xFFF4F8F5);   // Natural Light Canvas
  static const Color greenChipFill = Color(0xFFDEEBE2);     // Active Pill Background
  
  // Neutrals & Surfaces
  static const Color cardWhite = Color(0xFFFFFFFF);
  static const Color cardBorder = Color(0xFFE2ECE6);
  static const Color textDark = Color(0xFF11291F);          // Deep Slate Text
  static const Color textMuted = Color(0xFF527063);         // Muted Sage Subtitle
  static const Color textLight = Color(0xFF819C8F);

  // Quality Status Palette (Vibrant yet Nature-Tailored)
  static const Color statusGood = Color(0xFF2E7D32);        // Green
  static const Color statusGoodBg = Color(0xFFE8F5E9);
  static const Color statusModerate = Color(0xFFF57F17);    // Amber
  static const Color statusModerateBg = Color(0xFFFFF8E1);
  static const Color statusPoor = Color(0xFFE65100);        // Deep Orange
  static const Color statusPoorBg = Color(0xFFFBE9E7);
  static const Color statusVeryPoor = Color(0xFFC62828);    // Deep Red
  static const Color statusVeryPoorBg = Color(0xFFFFEBEE);
  static const Color statusSevere = Color(0xFF6A1B9A);      // Purple
  static const Color statusSevereBg = Color(0xFFF3E5F5);
}

class AppTheme {
  static ThemeData get lightTheme {
    final baseTextTheme = ThemeData.light().textTheme.apply(
      fontFamily: GoogleFonts.plusJakartaSans().fontFamily,
      bodyColor: AppColors.textDark,
      displayColor: AppColors.textDark,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primaryGreen,
        primary: AppColors.primaryGreen,
        onPrimary: Colors.white,
        secondary: AppColors.primaryGreenLight,
        surface: AppColors.cardWhite,
        onSurface: AppColors.textDark,
        surfaceContainerLowest: AppColors.greenBackground,
      ),
      scaffoldBackgroundColor: AppColors.greenBackground,
      
      // App Bar Styling
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.cardWhite,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          color: AppColors.primaryGreen,
          fontSize: 20,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.1,
        ),
        iconTheme: const IconThemeData(
          color: AppColors.primaryGreen,
          size: 24,
        ),
      ),

      // Card Theme
      cardTheme: CardThemeData(
        color: AppColors.cardWhite,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: AppColors.cardBorder, width: 1),
        ),
      ),

      // Text Theme using Google Fonts
      textTheme: baseTextTheme,

      // Drawer Theme
      drawerTheme: const DrawerThemeData(
        backgroundColor: AppColors.cardWhite,
        elevation: 16,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.horizontal(right: Radius.circular(24)),
        ),
      ),

      // Chip Theme
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.greenContainer,
        selectedColor: AppColors.primaryGreen,
        secondarySelectedColor: AppColors.primaryGreen,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        labelStyle: const TextStyle(color: AppColors.textDark, fontSize: 13, fontWeight: FontWeight.w600),
        secondaryLabelStyle: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(30),
          side: const BorderSide(color: Colors.transparent),
        ),
      ),

      // Navigation Bar / Navigation Rail
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.cardWhite,
        indicatorColor: AppColors.greenContainer,
        elevation: 8,
        labelTextStyle: WidgetStateProperty.all(
          GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.primaryGreen,
          ),
        ),
      ),
    );
  }
}
