/**
 * RouteBreakdown - Display route segments with time estimates
 */

import React from 'react';
import { Badge } from 'react-bootstrap';
import { Mountain, TrendingUp, ArrowDown, Clock, Info } from 'lucide-react';
import { RouteSegment } from '../../utils/RouteAnalyzer';

interface RouteBreakdownProps {
  segments: RouteSegment[];
}

export const RouteBreakdown: React.FC<RouteBreakdownProps> = ({ segments }) => {
  const getSegmentIcon = (segment: RouteSegment) => {
    switch (segment.id) {
      case 'approach':
      case 'uphill':
        return <Mountain size={16} className="text-success" />;
      case 'technical':
      case 'scrambling':
        return <TrendingUp size={16} className="text-warning" />;
      case 'descent':
      case 'downhill':
        return <ArrowDown size={16} className="text-info" />;
      default:
        return <Mountain size={16} className="text-muted" />;
    }
  };

  const getSegmentEmoji = (segment: RouteSegment) => {
    switch (segment.id) {
      case 'approach':
      case 'uphill':
        return '🥾';
      case 'technical':
        return '🧗';
      case 'scrambling':
        return '🪨';
      case 'descent':
      case 'downhill':
        return '⬇️';
      default:
        return '🏔️';
    }
  };

  const getTerrainTypeBadge = (terrainType: string) => {
    const badges = {
      munter: { variant: 'success', label: 'Munter Method' },
      chauvin: { variant: 'warning', label: 'Chauvin System' },
      technical: { variant: 'danger', label: 'Technical System' }
    };
    
    const badge = badges[terrainType as keyof typeof badges] || badges.munter;
    
    return (
      <Badge bg={badge.variant} className="small">
        {badge.label}
      </Badge>
    );
  };

  const formatTime = (hours: number): string => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    
    if (h === 0) {
      return `${m}min`;
    } else if (m === 0) {
      return `${h}h`;
    } else {
      return `${h}h ${m}min`;
    }
  };

  if (segments.length === 0) {
    return (
      <div className="text-center text-muted py-3">
        <Info size={20} className="mb-2" />
        <div>No route segments detected</div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <div className="fw-medium mb-3">Detected Route Segments:</div>
      
      {segments.map((segment, index) => (
        <div key={segment.id} className="mb-2">
          <div className="card border-0 bg-white p-3">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="d-flex align-items-center">
                {getSegmentIcon(segment)}
                <span className="me-2 ms-2">{getSegmentEmoji(segment)}</span>
                <span className="fw-medium">{segment.name}</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                {getTerrainTypeBadge(segment.terrainType)}
                <div className="d-flex align-items-center text-primary fw-bold">
                  <Clock size={14} className="me-1" />
                  {formatTime(segment.estimatedTime)}
                </div>
              </div>
            </div>
            
            <div className="d-flex justify-content-between align-items-center">
              <div className="text-muted small">
                {segment.details}
              </div>
              <div className="text-muted small">
                via {segment.calculationMethod}
              </div>
            </div>
          </div>
          
          {/* Add connecting line between segments (except for last segment) */}
          {index < segments.length - 1 && (
            <div className="text-center my-2">
              <div style={{ height: '20px', width: '2px', backgroundColor: '#dee2e6', margin: '0 auto' }}></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};