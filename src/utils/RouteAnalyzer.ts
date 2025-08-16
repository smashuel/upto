/**
 * Route Analyzer - Terrain detection and route segmentation
 * Automatically classifies terrain and determines calculation methods
 */

import { TimeCalculator, PaceFactors } from './TimeCalculator';

export interface RouteData {
  distance: number; // total distance in km
  elevationGain: number; // total elevation gain in meters
  elevationLoss: number; // total elevation loss in meters
  activityType: 'hiking' | 'climbing' | 'skiing' | 'other';
  climbingGrade?: string; // "5.7", "5.10a", etc.
  numberOfPitches?: number;
  routeDescription?: string;
  season?: 'spring' | 'summer' | 'fall' | 'winter';
}

export interface RouteSegment {
  id: string;
  name: string;
  terrainType: 'munter' | 'chauvin' | 'technical';
  distance: number; // km
  elevationGain: number; // meters (absolute value)
  elevationLoss: number; // meters (absolute value)
  difficulty?: string;
  pitches?: number;
  estimatedTime: number; // hours
  calculationMethod: string;
  details: string;
}

export class RouteAnalyzer {
  /**
   * Analyze route data and break into segments with time estimates
   */
  static analyzeRoute(routeData: RouteData, paceFactors: PaceFactors): RouteSegment[] {
    // Determine if this is a technical climbing route
    if (this.isTechnicalClimbing(routeData)) {
      return this.analyzeTechnicalRoute(routeData, paceFactors);
    }

    // Determine if this has significant scrambling sections
    if (this.hasScrambling(routeData)) {
      return this.analyzeScramblingRoute(routeData, paceFactors);
    }

    // Default to hiking analysis
    return this.analyzeHikingRoute(routeData, paceFactors);
  }

  /**
   * Check if route involves technical roped climbing
   */
  private static isTechnicalClimbing(routeData: RouteData): boolean {
    return !!(
      routeData.activityType === 'climbing' && 
      routeData.climbingGrade && 
      routeData.numberOfPitches &&
      this.parseClimbingGrade(routeData.climbingGrade).isClass5
    );
  }

  /**
   * Check if route has significant scrambling sections
   */
  private static hasScrambling(routeData: RouteData): boolean {
    const grade = routeData.elevationGain / (routeData.distance * 1000); // grade as decimal
    return grade > 0.25 && routeData.elevationGain > 300; // >25% grade and >1000ft gain
  }

  /**
   * Analyze technical climbing route
   */
  private static analyzeTechnicalRoute(routeData: RouteData, paceFactors: PaceFactors): RouteSegment[] {
    const segments: RouteSegment[] = [];
    const gradeInfo = this.parseClimbingGrade(routeData.climbingGrade!);
    
    // Approach segment (assume 30% of distance/elevation is approach)
    const approachDistance = routeData.distance * 0.3;
    const approachElevation = routeData.elevationGain * 0.3;
    
    if (approachDistance > 0 || approachElevation > 0) {
      const approachTime = TimeCalculator.munterMethod(
        approachDistance,
        approachElevation,
        'uphill',
        paceFactors
      );
      
      segments.push({
        id: 'approach',
        name: 'Approach Hike',
        terrainType: 'munter',
        distance: approachDistance,
        elevationGain: approachElevation,
        elevationLoss: 0,
        estimatedTime: approachTime.realistic,
        calculationMethod: approachTime.method,
        details: `${approachDistance.toFixed(1)} km, +${Math.round(approachElevation)}m`
      });
    }

    // Technical climbing segment
    const climbingTime = TimeCalculator.technicalSystem(
      routeData.numberOfPitches!,
      gradeInfo.difficulty,
      paceFactors
    );

    segments.push({
      id: 'technical',
      name: 'Technical Climbing',
      terrainType: 'technical',
      distance: routeData.distance * 0.4, // Assume 40% of total distance
      elevationGain: routeData.elevationGain * 0.4,
      elevationLoss: 0,
      pitches: routeData.numberOfPitches,
      difficulty: routeData.climbingGrade,
      estimatedTime: climbingTime.realistic,
      calculationMethod: climbingTime.method,
      details: `${routeData.numberOfPitches} pitches, ${routeData.climbingGrade}`
    });

    // Descent segment
    const descentDistance = routeData.distance * 0.3;
    const descentElevation = routeData.elevationLoss || routeData.elevationGain * 0.7; // Assume most elevation is lost on descent
    
    const descentTime = TimeCalculator.munterMethod(
      descentDistance,
      0, // Elevation loss doesn't slow hiking as much
      'downhill',
      paceFactors
    );

    segments.push({
      id: 'descent',
      name: 'Descent',
      terrainType: 'munter',
      distance: descentDistance,
      elevationGain: 0,
      elevationLoss: descentElevation,
      estimatedTime: descentTime.realistic,
      calculationMethod: descentTime.method,
      details: `${descentDistance.toFixed(1)} km, -${Math.round(descentElevation)}m`
    });

    return segments;
  }

  /**
   * Analyze scrambling route
   */
  private static analyzeScramblingRoute(routeData: RouteData, paceFactors: PaceFactors): RouteSegment[] {
    const segments: RouteSegment[] = [];
    
    // Approach section (easier terrain)
    const approachDistance = routeData.distance * 0.4;
    const approachElevation = routeData.elevationGain * 0.3;
    
    if (approachDistance > 0 || approachElevation > 0) {
      const approachTime = TimeCalculator.munterMethod(
        approachDistance,
        approachElevation,
        'uphill',
        paceFactors
      );
      
      segments.push({
        id: 'approach',
        name: 'Approach Hike',
        terrainType: 'munter',
        distance: approachDistance,
        elevationGain: approachElevation,
        elevationLoss: 0,
        estimatedTime: approachTime.realistic,
        calculationMethod: approachTime.method,
        details: `${approachDistance.toFixed(1)} km, +${Math.round(approachElevation)}m`
      });
    }

    // Scrambling section
    const scramblingDistance = routeData.distance * 0.4;
    const scramblingElevation = routeData.elevationGain * 0.6;
    
    const difficulty = this.estimateScamblingDifficulty(routeData);
    const scramblingTime = TimeCalculator.chauvincSystem(
      scramblingDistance,
      scramblingElevation,
      difficulty,
      paceFactors
    );

    segments.push({
      id: 'scrambling',
      name: 'Scrambling/Technical Terrain',
      terrainType: 'chauvin',
      distance: scramblingDistance,
      elevationGain: scramblingElevation,
      elevationLoss: 0,
      difficulty: difficulty,
      estimatedTime: scramblingTime.realistic,
      calculationMethod: scramblingTime.method,
      details: `${scramblingDistance.toFixed(1)} km, +${Math.round(scramblingElevation)}m, ${difficulty.replace('_', ' ')}`
    });

    // Descent
    const descentDistance = routeData.distance * 0.2;
    const descentElevation = routeData.elevationLoss || routeData.elevationGain * 0.9;
    
    const descentTime = TimeCalculator.munterMethod(
      descentDistance,
      0,
      'downhill',
      paceFactors
    );

    segments.push({
      id: 'descent',
      name: 'Descent',
      terrainType: 'munter',
      distance: descentDistance,
      elevationGain: 0,
      elevationLoss: descentElevation,
      estimatedTime: descentTime.realistic,
      calculationMethod: descentTime.method,
      details: `${descentDistance.toFixed(1)} km, -${Math.round(descentElevation)}m`
    });

    return segments;
  }

  /**
   * Analyze hiking route
   */
  private static analyzeHikingRoute(routeData: RouteData, paceFactors: PaceFactors): RouteSegment[] {
    const segments: RouteSegment[] = [];
    
    // For hiking routes, we'll split based on elevation profile
    const totalDistance = routeData.distance;
    const totalElevation = routeData.elevationGain;
    
    // Uphill section (assume 60% of route is gaining elevation)
    if (totalElevation > 0) {
      const uphillDistance = totalDistance * 0.6;
      const uphillTime = TimeCalculator.munterMethod(
        uphillDistance,
        totalElevation,
        routeData.activityType === 'skiing' ? 'skiing' : 'uphill',
        paceFactors
      );
      
      segments.push({
        id: 'uphill',
        name: routeData.activityType === 'skiing' ? 'Ascent (Skiing)' : 'Uphill Hiking',
        terrainType: 'munter',
        distance: uphillDistance,
        elevationGain: totalElevation,
        elevationLoss: 0,
        estimatedTime: uphillTime.realistic,
        calculationMethod: uphillTime.method,
        details: `${uphillDistance.toFixed(1)} km, +${Math.round(totalElevation)}m`
      });
    }

    // Downhill/flat section
    const downhillDistance = totalDistance * 0.4;
    const downhillElevation = routeData.elevationLoss || totalElevation * 0.8;
    
    if (downhillDistance > 0) {
      const downhillTime = TimeCalculator.munterMethod(
        downhillDistance,
        0,
        routeData.activityType === 'skiing' ? 'skiing' : 'downhill',
        paceFactors
      );
      
      segments.push({
        id: 'downhill',
        name: routeData.activityType === 'skiing' ? 'Descent (Skiing)' : 'Descent/Return',
        terrainType: 'munter',
        distance: downhillDistance,
        elevationGain: 0,
        elevationLoss: downhillElevation,
        estimatedTime: downhillTime.realistic,
        calculationMethod: downhillTime.method,
        details: `${downhillDistance.toFixed(1)} km, -${Math.round(downhillElevation)}m`
      });
    }

    return segments;
  }

  /**
   * Parse climbing grade and categorize difficulty
   */
  private static parseClimbingGrade(grade: string): { difficulty: '5.0-5.4' | '5.5-5.7' | '5.8-5.9' | '5.10-5.11' | '5.12+', isClass5: boolean } {
    const isClass5 = grade.startsWith('5.');
    
    if (!isClass5) {
      return { difficulty: '5.0-5.4', isClass5: false };
    }

    const numericGrade = parseFloat(grade.replace('5.', ''));
    
    if (numericGrade <= 4) return { difficulty: '5.0-5.4', isClass5: true };
    if (numericGrade <= 7) return { difficulty: '5.5-5.7', isClass5: true };
    if (numericGrade <= 9) return { difficulty: '5.8-5.9', isClass5: true };
    if (numericGrade <= 11) return { difficulty: '5.10-5.11', isClass5: true };
    return { difficulty: '5.12+', isClass5: true };
  }

  /**
   * Estimate scrambling difficulty based on route characteristics
   */
  private static estimateScamblingDifficulty(routeData: RouteData): 'class3_easy' | 'class3_hard' | 'class4_easy' | 'class4_hard' | 'snow_moderate' | 'snow_steep' {
    const grade = routeData.elevationGain / (routeData.distance * 1000);
    const isWinter = routeData.season === 'winter';
    
    if (isWinter) {
      return grade > 0.4 ? 'snow_steep' : 'snow_moderate';
    }
    
    if (grade > 0.5) return 'class4_hard';
    if (grade > 0.35) return 'class4_easy';
    if (grade > 0.3) return 'class3_hard';
    return 'class3_easy';
  }

  /**
   * Get mock/demo route data for testing
   */
  static getMockRouteData(): RouteData {
    return {
      distance: 5.0, // 5km total
      elevationGain: 1200, // 1200m gain
      elevationLoss: 1200, // 1200m loss
      activityType: 'climbing',
      climbingGrade: '5.7',
      numberOfPitches: 6,
      routeDescription: 'Multi-pitch granite route with approach hike',
      season: 'summer'
    };
  }
}