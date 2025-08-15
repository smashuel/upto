/**
 * GuidePace Time Calculator
 * Professional mountain guide time estimation formulas
 */

export interface PaceFactors {
  fitness: number; // 0.8-1.2 (below average to above average)
  weather: number; // 0.9-1.3 (good to poor conditions)
  partySize: number; // 1.0-1.4 (solo to large group)
  packWeight: number; // 0.95-1.15 (light to heavy)
  experience: number; // 0.9-1.1 (expert to beginner)
}

export interface TimeEstimate {
  optimistic: number; // hours
  realistic: number; // hours
  conservative: number; // hours
  method: string;
}

export class TimeCalculator {
  /**
   * Munter Method - For hiking and skiing (Class 1-2 terrain)
   * Formula: time = (distance + elevation/100) / rate
   * @param distance Distance in kilometers
   * @param elevation Elevation gain in meters
   * @param terrainType Type of terrain affecting pace
   * @param paceFactors Adjustment factors
   */
  static munterMethod(
    distance: number, 
    elevation: number, 
    terrainType: 'uphill' | 'flat' | 'downhill' | 'bushwhacking' | 'skiing',
    paceFactors: PaceFactors
  ): TimeEstimate {
    // Base rates (km/h equivalent)
    const rates = {
      uphill: 4,
      flat: 6,
      downhill: 6,
      bushwhacking: 2,
      skiing: 10
    };

    const baseTime = (distance + elevation / 100) / rates[terrainType];
    
    // Apply pace factors
    const adjustmentFactor = 
      paceFactors.fitness * 
      paceFactors.weather * 
      paceFactors.partySize * 
      paceFactors.packWeight * 
      paceFactors.experience;

    const realisticTime = baseTime * adjustmentFactor;

    return {
      optimistic: realisticTime * 0.85,
      realistic: realisticTime,
      conservative: realisticTime * 1.25,
      method: 'Munter Method'
    };
  }

  /**
   * Chauvin System - For scrambling and snow climbing (Class 3-4 terrain)
   * Formula: time = (distance × 1000 + elevation) × rate / 60
   * @param distance Distance in kilometers
   * @param elevation Elevation gain in meters
   * @param difficulty Terrain difficulty
   * @param paceFactors Adjustment factors
   */
  static chauvincSystem(
    distance: number,
    elevation: number,
    difficulty: 'class3_easy' | 'class3_hard' | 'class4_easy' | 'class4_hard' | 'snow_moderate' | 'snow_steep',
    paceFactors: PaceFactors
  ): TimeEstimate {
    // Rate in minutes per 60m pitch equivalent
    const rates = {
      class3_easy: 10,
      class3_hard: 15,
      class4_easy: 20,
      class4_hard: 25,
      snow_moderate: 18,
      snow_steep: 30
    };

    // Convert to 60m pitch equivalents
    const pitchEquivalents = (distance * 1000 + elevation) / 60;
    const baseTime = (pitchEquivalents * rates[difficulty]) / 60; // Convert to hours

    // Apply pace factors
    const adjustmentFactor = 
      paceFactors.fitness * 
      paceFactors.weather * 
      paceFactors.partySize * 
      paceFactors.packWeight * 
      paceFactors.experience;

    const realisticTime = baseTime * adjustmentFactor;

    return {
      optimistic: realisticTime * 0.8,
      realistic: realisticTime,
      conservative: realisticTime * 1.3,
      method: 'Chauvin System'
    };
  }

  /**
   * Technical System - For roped climbing (Class 5 terrain)
   * Formula: time = pitches × rate / 60
   * @param pitches Number of climbing pitches
   * @param difficulty Climbing grade
   * @param paceFactors Adjustment factors
   */
  static technicalSystem(
    pitches: number,
    difficulty: '5.0-5.4' | '5.5-5.7' | '5.8-5.9' | '5.10-5.11' | '5.12+',
    paceFactors: PaceFactors
  ): TimeEstimate {
    // Rate in minutes per pitch
    const rates = {
      '5.0-5.4': 30,
      '5.5-5.7': 45,
      '5.8-5.9': 60,
      '5.10-5.11': 75,
      '5.12+': 90
    };

    const baseTime = (pitches * rates[difficulty]) / 60; // Convert to hours

    // Apply pace factors
    const adjustmentFactor = 
      paceFactors.fitness * 
      paceFactors.weather * 
      paceFactors.partySize * 
      paceFactors.packWeight * 
      paceFactors.experience;

    const realisticTime = baseTime * adjustmentFactor;

    return {
      optimistic: realisticTime * 0.75,
      realistic: realisticTime,
      conservative: realisticTime * 1.4,
      method: 'Technical System'
    };
  }

  /**
   * Calculate safety recommendations based on total time estimate
   */
  static getSafetyRecommendations(
    totalTime: number,
    season: 'spring' | 'summer' | 'fall' | 'winter' = 'summer'
  ) {
    // Daylight hours by season (approximate)
    const daylightHours = {
      spring: 12,
      summer: 14,
      fall: 10,
      winter: 8
    };

    const availableLight = daylightHours[season];
    const bufferTime = 2; // 2-hour safety buffer

    // Latest safe start time
    const latestStart = availableLight - totalTime - bufferTime;
    const recommendedStart = Math.max(latestStart - 1, 5); // No later than latest, no earlier than 5am

    // Turnaround time (halfway point for return trips)
    const turnaroundTime = totalTime * 0.6; // 60% of total time for approach + climb

    return {
      recommendedStartTime: `${Math.floor(recommendedStart)}:${(recommendedStart % 1 * 60).toString().padStart(2, '0')}`,
      latestStartTime: `${Math.floor(latestStart)}:${(latestStart % 1 * 60).toString().padStart(2, '0')}`,
      turnaroundTime: `${Math.floor(turnaroundTime)}:${(turnaroundTime % 1 * 60).toString().padStart(2, '0')}`,
      daylightMargin: availableLight - totalTime - bufferTime,
      warnings: [
        ...(totalTime > availableLight - bufferTime ? ['⚠️ Route may require headlamp/early start'] : []),
        ...(totalTime > availableLight ? ['🚨 Route exceeds daylight hours - consider splitting'] : []),
        ...(turnaroundTime > availableLight * 0.5 ? ['⏰ Tight turnaround schedule - monitor progress'] : [])
      ]
    };
  }

  /**
   * Get default pace factors (neutral baseline)
   */
  static getDefaultPaceFactors(): PaceFactors {
    return {
      fitness: 1.0,
      weather: 1.0,
      partySize: 1.0,
      packWeight: 1.0,
      experience: 1.0
    };
  }
}