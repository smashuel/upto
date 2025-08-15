/**
 * PaceFactorControls - Adjustable parameters for pace calculation
 */

import React from 'react';
import { Row, Col, Form, Badge } from 'react-bootstrap';
import { Activity, Cloud, Users, Package, Award, RotateCcw } from 'lucide-react';
import { PaceFactors } from '../../utils/TimeCalculator';

interface PaceFactorControlsProps {
  paceFactors: PaceFactors;
  onChange: (factors: PaceFactors) => void;
}

export const PaceFactorControls: React.FC<PaceFactorControlsProps> = ({
  paceFactors,
  onChange
}) => {
  const handleFactorChange = (factor: keyof PaceFactors, value: number) => {
    onChange({
      ...paceFactors,
      [factor]: value
    });
  };

  const resetToDefaults = () => {
    onChange({
      fitness: 1.0,
      weather: 1.0,
      partySize: 1.0,
      packWeight: 1.0,
      experience: 1.0
    });
  };

  const getFactorLabel = (value: number, type: string): { label: string; variant: string } => {
    if (type === 'fitness') {
      if (value <= 0.85) return { label: 'Below Average', variant: 'warning' };
      if (value >= 1.15) return { label: 'Above Average', variant: 'success' };
      return { label: 'Average', variant: 'secondary' };
    }
    
    if (type === 'weather') {
      if (value <= 0.95) return { label: 'Perfect', variant: 'success' };
      if (value >= 1.2) return { label: 'Poor', variant: 'danger' };
      return { label: 'Good', variant: 'info' };
    }
    
    if (type === 'partySize') {
      if (value <= 1.05) return { label: 'Solo/Pair', variant: 'info' };
      if (value >= 1.25) return { label: 'Large Group', variant: 'warning' };
      return { label: 'Small Group', variant: 'secondary' };
    }
    
    if (type === 'packWeight') {
      if (value <= 0.98) return { label: 'Light Pack', variant: 'success' };
      if (value >= 1.1) return { label: 'Heavy Pack', variant: 'warning' };
      return { label: 'Normal Pack', variant: 'secondary' };
    }
    
    if (type === 'experience') {
      if (value <= 0.95) return { label: 'Expert', variant: 'success' };
      if (value >= 1.05) return { label: 'Beginner', variant: 'info' };
      return { label: 'Intermediate', variant: 'secondary' };
    }
    
    return { label: 'Normal', variant: 'secondary' };
  };

  const calculateTotalAdjustment = (): number => {
    return paceFactors.fitness * 
           paceFactors.weather * 
           paceFactors.partySize * 
           paceFactors.packWeight * 
           paceFactors.experience;
  };

  const totalAdjustment = calculateTotalAdjustment();
  const isSlowerThanNormal = totalAdjustment > 1.05;
  const isFasterThanNormal = totalAdjustment < 0.95;

  return (
    <div className="bg-white rounded border p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">Pace Factor Adjustments</h6>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm d-flex align-items-center"
          onClick={resetToDefaults}
        >
          <RotateCcw size={14} className="me-1" />
          Reset
        </button>
      </div>
      
      <Row>
        {/* Fitness Level */}
        <Col md={6} className="mb-3">
          <div className="d-flex align-items-center mb-2">
            <Activity size={16} className="me-2 text-primary" />
            <Form.Label className="mb-0 small fw-medium">Fitness Level</Form.Label>
            <Badge 
              bg={getFactorLabel(paceFactors.fitness, 'fitness').variant} 
              className="ms-auto small"
            >
              {getFactorLabel(paceFactors.fitness, 'fitness').label}
            </Badge>
          </div>
          <Form.Range
            min={0.8}
            max={1.2}
            step={0.05}
            value={paceFactors.fitness}
            onChange={(e) => handleFactorChange('fitness', parseFloat(e.target.value))}
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>Below Avg</span>
            <span>Above Avg</span>
          </div>
        </Col>

        {/* Weather Conditions */}
        <Col md={6} className="mb-3">
          <div className="d-flex align-items-center mb-2">
            <Cloud size={16} className="me-2 text-info" />
            <Form.Label className="mb-0 small fw-medium">Weather Conditions</Form.Label>
            <Badge 
              bg={getFactorLabel(paceFactors.weather, 'weather').variant} 
              className="ms-auto small"
            >
              {getFactorLabel(paceFactors.weather, 'weather').label}
            </Badge>
          </div>
          <Form.Range
            min={0.9}
            max={1.3}
            step={0.05}
            value={paceFactors.weather}
            onChange={(e) => handleFactorChange('weather', parseFloat(e.target.value))}
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>Perfect</span>
            <span>Poor</span>
          </div>
        </Col>

        {/* Party Size */}
        <Col md={6} className="mb-3">
          <div className="d-flex align-items-center mb-2">
            <Users size={16} className="me-2 text-success" />
            <Form.Label className="mb-0 small fw-medium">Party Size</Form.Label>
            <Badge 
              bg={getFactorLabel(paceFactors.partySize, 'partySize').variant} 
              className="ms-auto small"
            >
              {getFactorLabel(paceFactors.partySize, 'partySize').label}
            </Badge>
          </div>
          <Form.Range
            min={1.0}
            max={1.4}
            step={0.05}
            value={paceFactors.partySize}
            onChange={(e) => handleFactorChange('partySize', parseFloat(e.target.value))}
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>Solo/Pair</span>
            <span>Large Group</span>
          </div>
        </Col>

        {/* Pack Weight */}
        <Col md={6} className="mb-3">
          <div className="d-flex align-items-center mb-2">
            <Package size={16} className="me-2 text-warning" />
            <Form.Label className="mb-0 small fw-medium">Pack Weight</Form.Label>
            <Badge 
              bg={getFactorLabel(paceFactors.packWeight, 'packWeight').variant} 
              className="ms-auto small"
            >
              {getFactorLabel(paceFactors.packWeight, 'packWeight').label}
            </Badge>
          </div>
          <Form.Range
            min={0.95}
            max={1.15}
            step={0.02}
            value={paceFactors.packWeight}
            onChange={(e) => handleFactorChange('packWeight', parseFloat(e.target.value))}
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>Light</span>
            <span>Heavy</span>
          </div>
        </Col>

        {/* Experience Level */}
        <Col md={6} className="mb-3">
          <div className="d-flex align-items-center mb-2">
            <Award size={16} className="me-2 text-purple" />
            <Form.Label className="mb-0 small fw-medium">Route Experience</Form.Label>
            <Badge 
              bg={getFactorLabel(paceFactors.experience, 'experience').variant} 
              className="ms-auto small"
            >
              {getFactorLabel(paceFactors.experience, 'experience').label}
            </Badge>
          </div>
          <Form.Range
            min={0.9}
            max={1.1}
            step={0.02}
            value={paceFactors.experience}
            onChange={(e) => handleFactorChange('experience', parseFloat(e.target.value))}
          />
          <div className="d-flex justify-content-between small text-muted">
            <span>Expert</span>
            <span>Beginner</span>
          </div>
        </Col>
      </Row>

      {/* Total Adjustment Summary */}
      <div className="mt-3 pt-3 border-top">
        <div className="d-flex justify-content-between align-items-center">
          <span className="fw-medium small">Total Pace Adjustment:</span>
          <Badge 
            bg={isFasterThanNormal ? 'success' : isSlowerThanNormal ? 'warning' : 'secondary'}
            className="px-2 py-1"
          >
            {totalAdjustment < 1 ? 
              `${Math.round((1 - totalAdjustment) * 100)}% faster` : 
              totalAdjustment > 1 ? 
                `${Math.round((totalAdjustment - 1) * 100)}% slower` : 
                'Normal pace'
            }
          </Badge>
        </div>
        <div className="small text-muted mt-1">
          Times will be {totalAdjustment < 1 ? 'reduced' : totalAdjustment > 1 ? 'increased' : 'unchanged'} based on your selected factors
        </div>
      </div>
    </div>
  );
};