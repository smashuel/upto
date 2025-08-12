import React, { useState } from 'react';
import { Container, Row, Col, ProgressBar } from 'react-bootstrap';
import { ArrowLeft, ArrowRight, Save, Eye } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Button, Card } from '../components/ui';
import { AdventureBasicsStep } from '../components/forms/AdventureBasicsStep';
import { AdventureScheduleStep } from '../components/forms/AdventureScheduleStep';
import { AdventureLocationStep } from '../components/forms/AdventureLocationStep';
import { AdventureContactsStep } from '../components/forms/AdventureContactsStep';
import { AdventurePreview } from '../components/adventure/AdventurePreview';
import { AdventureShareLink } from '../components/adventure/AdventureShareLink';
import type { Adventure } from '../types/adventure';

const STEPS = [
  { id: 1, title: 'Adventure Details', description: 'Basic information about your adventure' },
  { id: 2, title: 'Schedule', description: 'Start time, duration, and check-ins' },
  { id: 3, title: 'Location & Route', description: 'Where you\'re going and your planned route' },
  { id: 4, title: 'Emergency Contacts', description: 'Who to notify in case of emergency' },
  { id: 5, title: 'Review & Share', description: 'Preview your plan and generate share link' },
];

interface AdventureFormData {
  title: string;
  description: string;
  activityType: string;
  difficulty: string;
  startDate: string;
  endDate: string;
  checkInInterval: number;
  location: string;
  waypoints: Array<{ name: string; coordinates: [number, number]; estimatedTime: string }>;
  emergencyContacts: Array<{ id: string; name: string; email: string; phone: string; relationship: string; isPrimary: boolean }>;
}

export const CreateAdventure: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [adventureId, setAdventureId] = useState<string | null>(null);

  const methods = useForm<AdventureFormData>({
    defaultValues: {
      title: '',
      description: '',
      activityType: 'hiking',
      difficulty: 'moderate',
      startDate: '',
      endDate: '',
      checkInInterval: 24,
      location: '',
      waypoints: [],
      emergencyContacts: [],
    },
  });

  const { handleSubmit, watch } = methods;
  const formData = watch();

  const progress = (currentStep / STEPS.length) * 100;

  const handleNextStep = async () => {
    if (currentStep < STEPS.length) {
      // Validate current step before proceeding
      const isValid = await methods.trigger();
      if (isValid) {
        setCurrentStep(currentStep + 1);
      } else {
        toast.error('Please fix the errors before continuing');
      }
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: AdventureFormData) => {
    try {
      // Generate adventure ID
      const newAdventureId = `adventure-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create adventure object
      const adventure: Adventure = {
        id: newAdventureId,
        title: data.title,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        location: {
          name: data.location,
          coordinates: data.waypoints[0]?.coordinates || [0, 0],
        },
        activities: [{
          id: `activity-${Date.now()}`,
          type: data.activityType as any,
          name: data.title,
          estimatedDuration: Math.ceil((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / (1000 * 60)),
          difficulty: data.difficulty as any,
          equipment: [],
          route: data.waypoints.length > 0 ? { waypoints: data.waypoints.map(wp => ({
            name: wp.name,
            coordinates: wp.coordinates,
            estimatedTime: new Date(wp.estimatedTime),
          })) } : undefined,
        }],
        emergencyContacts: data.emergencyContacts,
        checkInInterval: data.checkInInterval,
        status: 'planned',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to localStorage (Phase 2 persistence)
      const existingAdventures = JSON.parse(localStorage.getItem('adventures') || '[]');
      existingAdventures.push(adventure);
      localStorage.setItem('adventures', JSON.stringify(existingAdventures));

      setAdventureId(newAdventureId);
      toast.success('Adventure plan created successfully!');
      setCurrentStep(5); // Go to review step
    } catch (error) {
      toast.error('Failed to create adventure plan');
      console.error('Error creating adventure:', error);
    }
  };

  const togglePreview = () => {
    setIsPreviewMode(!isPreviewMode);
  };

  const renderStepContent = () => {
    if (isPreviewMode) {
      return <AdventurePreview formData={formData} />;
    }

    switch (currentStep) {
      case 1:
        return <AdventureBasicsStep />;
      case 2:
        return <AdventureScheduleStep />;
      case 3:
        return <AdventureLocationStep />;
      case 4:
        return <AdventureContactsStep />;
      case 5:
        return (
          <div className="space-y-4">
            <AdventurePreview formData={formData} />
            {adventureId && <AdventureShareLink adventureId={adventureId} />}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Highland Hero Section */}
      <section className="highland-section">
        <div className="highland-overlay"></div>
        <Container className="hero-content">
          <Row className="align-items-center" style={{ minHeight: '40vh' }}>
            <Col className="text-center text-white">
              <div className="fade-in">
                <h1 className="text-hero mb-4">Create Your Adventure</h1>
                <p className="lead mb-0 text-hero">
                  Plan your next outdoor adventure with our comprehensive safety wizard
                </p>
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <Container className="py-4">
        <Row>
          <Col>
            <div className="mb-4">
              <p className="text-muted">Follow our step-by-step wizard to create a detailed safety plan and keep your loved ones informed.</p>
            </div>

          {/* Progress Bar */}
          <Card className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="mb-0">Step {currentStep} of {STEPS.length}</h6>
              <Button 
                variant="outline-primary" 
                size="sm" 
                icon={Eye}
                onClick={togglePreview}
              >
                {isPreviewMode ? 'Edit' : 'Preview'}
              </Button>
            </div>
            
            <ProgressBar 
              now={progress} 
              className="progress-adventure mb-3"
              style={{ height: '8px' }}
            />
            
            <div className="row">
              {STEPS.map((step) => (
                <div key={step.id} className="col">
                  <div 
                    className={`text-center p-2 rounded ${
                      step.id === currentStep 
                        ? 'bg-primary text-white' 
                        : step.id < currentStep 
                          ? 'bg-success text-white'
                          : 'bg-light text-muted'
                    }`}
                  >
                    <div className="fw-bold small">{step.title}</div>
                    <div className="small">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Step Content */}
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="step-wizard p-4 mb-4">
                {renderStepContent()}
              </div>

              {/* Navigation Buttons */}
              {!isPreviewMode && (
                <Card>
                  <div className="d-flex justify-content-between">
                    <Button
                      variant="outline-secondary"
                      onClick={handlePreviousStep}
                      disabled={currentStep === 1}
                      icon={ArrowLeft}
                    >
                      Previous
                    </Button>

                    <div className="d-flex gap-2">
                      {currentStep === STEPS.length - 1 ? (
                        <Button
                          type="submit"
                          variant="success"
                          icon={Save}
                          size="lg"
                        >
                          Create Adventure Plan
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={handleNextStep}
                          icon={ArrowRight}
                          size="lg"
                        >
                          Next Step
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            </form>
          </FormProvider>
          </Col>
        </Row>
      </Container>
    </div>
  );
};