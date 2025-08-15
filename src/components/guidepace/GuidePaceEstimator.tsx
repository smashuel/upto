/**
 * GuidePaceEstimator - Main expandable component for professional time estimation
 */

import React, { useState, useEffect } from 'react';
import { Card, Collapse, Button } from 'react-bootstrap';
import { ChevronDown, ChevronUp, Search, Clock, Settings } from 'lucide-react';
import { RouteAnalyzer, RouteData, RouteSegment } from '../../utils/RouteAnalyzer';
import { TimeCalculator, PaceFactors } from '../../utils/TimeCalculator';
import { RouteBreakdown } from './RouteBreakdown';
import { PaceFactorControls } from './PaceFactorControls';
import { TimeEstimateSummary } from './TimeEstimateSummary';

interface GuidePaceEstimatorProps {
  isVisible: boolean;
  routeData?: RouteData;
}

export const GuidePaceEstimator: React.FC<GuidePaceEstimatorProps> = ({ 
  isVisible, 
  routeData 
}) => {
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [paceFactors, setPaceFactors] = useState<PaceFactors>(TimeCalculator.getDefaultPaceFactors());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [totalTime, setTotalTime] = useState(0);

  // Use mock data if no route data provided
  const currentRouteData = routeData || RouteAnalyzer.getMockRouteData();

  // Analyze route when component becomes visible or pace factors change
  useEffect(() => {
    if (isVisible) {
      analyzeRoute();
    }
  }, [isVisible, paceFactors]);

  const analyzeRoute = async () => {
    setIsAnalyzing(true);
    
    // Simulate analysis delay for better UX
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const analyzedSegments = RouteAnalyzer.analyzeRoute(currentRouteData, paceFactors);
    setSegments(analyzedSegments);
    
    // Calculate total time
    const total = analyzedSegments.reduce((sum, segment) => sum + segment.estimatedTime, 0);
    setTotalTime(total);
    
    setIsAnalyzing(false);
  };

  const handlePaceFactorChange = (newFactors: PaceFactors) => {
    setPaceFactors(newFactors);
  };

  const safetyRecommendations = TimeCalculator.getSafetyRecommendations(
    totalTime, 
    currentRouteData.season
  );

  if (!isVisible) {
    return null;
  }

  return (
    <Card variant="step" className="border-primary bg-light mt-3">
      <div className="d-flex align-items-center mb-3">
        <Search size={20} className="me-2 text-primary" />
        <h5 className="h6 mb-0 text-primary">Route Analysis (Powered by GuidePace)</h5>
      </div>

      {isAnalyzing ? (
        <div className="text-center py-4">
          <div className="d-flex align-items-center justify-content-center mb-3">
            <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="text-muted">Analyzing your route...</span>
          </div>
          <div className="text-muted small">
            Detecting terrain types and calculating professional time estimates...
          </div>
        </div>
      ) : (
        <>
          {/* Route Breakdown */}
          <RouteBreakdown segments={segments} />
          
          {/* Time Estimate Summary */}
          <TimeEstimateSummary 
            totalTime={totalTime}
            safetyRecommendations={safetyRecommendations}
          />
          
          {/* Advanced Options Toggle */}
          <div className="mt-3 pt-3 border-top">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              className="d-flex align-items-center"
            >
              <Settings size={16} className="me-1" />
              Advanced Parameters
              {showAdvancedOptions ? (
                <ChevronUp size={16} className="ms-1" />
              ) : (
                <ChevronDown size={16} className="ms-1" />
              )}
            </Button>
            
            <Collapse in={showAdvancedOptions}>
              <div className="mt-3">
                <PaceFactorControls
                  paceFactors={paceFactors}
                  onChange={handlePaceFactorChange}
                />
              </div>
            </Collapse>
          </div>
        </>
      )}
    </Card>
  );
};