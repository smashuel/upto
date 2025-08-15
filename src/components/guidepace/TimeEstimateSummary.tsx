/**
 * TimeEstimateSummary - Total time estimate with safety recommendations
 */

import React from 'react';
import { Alert, Badge } from 'react-bootstrap';
import { Clock, Sun, AlertTriangle, CheckCircle, Info, Sunrise } from 'lucide-react';

interface SafetyRecommendations {
  recommendedStartTime: string;
  latestStartTime: string;
  turnaroundTime: string;
  daylightMargin: number;
  warnings: string[];
}

interface TimeEstimateSummaryProps {
  totalTime: number;
  safetyRecommendations: SafetyRecommendations;
}

export const TimeEstimateSummary: React.FC<TimeEstimateSummaryProps> = ({
  totalTime,
  safetyRecommendations
}) => {
  const formatTime = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    
    if (h === 0) {
      return `${m} minutes`;
    } else if (m === 0) {
      return `${h} hour${h !== 1 ? 's' : ''}`;
    } else {
      return `${h}h ${m}min`;
    }
  };

  const getTimeRange = (baseTime: number) => {
    const optimistic = baseTime * 0.85;
    const conservative = baseTime * 1.25;
    return `${formatTime(optimistic)} - ${formatTime(conservative)}`;
  };

  const getSafetyAlertVariant = () => {
    if (safetyRecommendations.warnings.length === 0) return 'success';
    if (safetyRecommendations.warnings.some(w => w.includes('🚨'))) return 'danger';
    return 'warning';
  };

  const getSafetyAlertIcon = () => {
    const variant = getSafetyAlertVariant();
    if (variant === 'success') return <CheckCircle size={20} />;
    if (variant === 'danger') return <AlertTriangle size={20} />;
    return <Info size={20} />;
  };

  return (
    <>
      {/* Total Time Estimate */}
      <div className="mb-3 p-3 bg-white rounded border-start border-primary border-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div className="d-flex align-items-center">
            <Clock size={20} className="me-2 text-primary" />
            <span className="fw-bold">⏱️ Estimated Total Time:</span>
          </div>
          <Badge bg="primary" className="px-3 py-2 fs-6">
            {formatTime(totalTime)}
          </Badge>
        </div>
        <div className="small text-muted">
          Realistic estimate • Range: {getTimeRange(totalTime)}
        </div>
      </div>

      {/* Safety Recommendations */}
      <Alert variant={getSafetyAlertVariant()} className="mb-3">
        <div className="d-flex align-items-start">
          {getSafetyAlertIcon()}
          <div className="ms-3 flex-grow-1">
            <Alert.Heading className="h6 mb-2">
              Safety & Timing Recommendations
            </Alert.Heading>
            
            <div className="row mb-2">
              <div className="col-md-6 mb-2">
                <div className="d-flex align-items-center small">
                  <Sunrise size={16} className="me-2 text-warning" />
                  <strong>Recommended Start:</strong>
                  <span className="ms-2">{safetyRecommendations.recommendedStartTime}</span>
                </div>
              </div>
              <div className="col-md-6 mb-2">
                <div className="d-flex align-items-center small">
                  <Sun size={16} className="me-2 text-info" />
                  <strong>Latest Start:</strong>
                  <span className="ms-2">{safetyRecommendations.latestStartTime}</span>
                </div>
              </div>
            </div>
            
            <div className="row mb-2">
              <div className="col-md-6 mb-2">
                <div className="d-flex align-items-center small">
                  <Clock size={16} className="me-2 text-secondary" />
                  <strong>Turnaround Time:</strong>
                  <span className="ms-2">{safetyRecommendations.turnaroundTime} elapsed</span>
                </div>
              </div>
              <div className="col-md-6 mb-2">
                <div className="d-flex align-items-center small">
                  <Sun size={16} className="me-2 text-success" />
                  <strong>Daylight Margin:</strong>
                  <span className="ms-2">
                    {safetyRecommendations.daylightMargin > 0 ? 
                      `+${formatTime(safetyRecommendations.daylightMargin)}` : 
                      `${formatTime(Math.abs(safetyRecommendations.daylightMargin))} short`
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {safetyRecommendations.warnings.length > 0 && (
              <div className="mt-2 pt-2 border-top">
                <div className="fw-medium small mb-1">Important Considerations:</div>
                {safetyRecommendations.warnings.map((warning, index) => (
                  <div key={index} className="small d-flex align-items-start mb-1">
                    <span className="me-2">•</span>
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Success message if no warnings */}
            {safetyRecommendations.warnings.length === 0 && (
              <div className="small">
                ✅ Route timing looks good with adequate daylight margin for safe completion.
              </div>
            )}
          </div>
        </div>
      </Alert>

      {/* Professional Note */}
      <div className="small text-muted bg-light p-2 rounded">
        <Info size={14} className="me-1" />
        <strong>Professional Guide Note:</strong> These estimates use proven mountain guide methodology. 
        Always add extra time for rest stops, navigation, and unexpected conditions. Consider weather, 
        season, and your party's actual capabilities when making final decisions.
      </div>
    </>
  );
};