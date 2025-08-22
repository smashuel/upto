import React, { useState } from 'react';
import { Container, Row, Col, ProgressBar } from 'react-bootstrap';
import { ArrowLeft, ArrowRight, Save, Eye } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Button, Card } from '../components/ui';
import { TripOverviewStep } from '../components/forms/TripOverviewStep';
import { TripLinkLocationStep } from '../components/forms/AdventureLocationStep';
import { TripDetailsStep } from '../components/forms/TripDetailsStep';
import { TripLinkContactsStep } from '../components/forms/AdventureContactsStep';
import { AdventurePreview } from '../components/adventure/AdventurePreview';
import { TripLinkShareLink } from '../components/adventure/AdventureShareLink';
import type { Adventure } from '../types/adventure';

const STEPS = [
  { id: 1, title: 'Trip Overview', description: 'Activity type, name, and start time' },
  { id: 2, title: 'Location & Route', description: 'Where you\'re going and your planned route' },
  { id: 3, title: 'Trip Details', description: 'Description and professional time estimation' },
  { id: 4, title: 'Emergency Contacts', description: 'Who to notify in case of emergency' },
  { id: 5, title: 'Review & Share', description: 'Preview your plan and generate share link' },
];

interface TripLinkFormData {
  activityType: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  checkInInterval: number;
  location: string;
  waypoints: Array<{ name: string; coordinates: [number, number]; estimatedTime: string }>;
  emergencyContacts: Array<{ id: string; name: string; email: string; phone: string; relationship: string; isPrimary: boolean }>;
}

export const CreateTripLink: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [tripLinkId, setTripLinkId] = useState<string | null>(null);

  const methods = useForm<TripLinkFormData>({
    defaultValues: {
      activityType: '',
      title: '',
      description: '',
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
      // Validate specific fields for current step
      let fieldsToValidate: string[] = [];
      
      switch (currentStep) {
        case 1: // Trip Overview
          fieldsToValidate = ['activityType', 'title', 'startDate'];
          break;
        case 2: // Location & Route
          fieldsToValidate = ['location'];
          break;
        case 3: // Trip Details
          fieldsToValidate = ['description'];
          break;
        case 4: // Emergency Contacts
          fieldsToValidate = ['emergencyContacts'];
          break;
        default:
          fieldsToValidate = [];
      }
      
      const isValid = fieldsToValidate.length > 0 ? await methods.trigger(fieldsToValidate as any) : await methods.trigger();
      if (isValid) {
        setCurrentStep(currentStep + 1);
      } else {
        toast.error('Please complete all required fields before continuing');
      }
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = async (data: TripLinkFormData) => {
    try {
      // Generate TripLink ID
      const newTripLinkId = `triplink-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Create TripLink object with calculated end date (default 8 hours from start)
      const startDate = new Date(data.startDate);
      const defaultEndDate = new Date(startDate.getTime() + (8 * 60 * 60 * 1000)); // Add 8 hours

      const tripLink: Adventure = {
        id: newTripLinkId,
        title: data.title,
        description: data.description,
        startDate: startDate,
        endDate: defaultEndDate,
        location: {
          name: data.location,
          coordinates: data.waypoints[0]?.coordinates || [0, 0],
        },
        activities: [{
          id: `activity-${Date.now()}`,
          type: data.activityType as any,
          name: data.title,
          estimatedDuration: Math.ceil((defaultEndDate.getTime() - startDate.getTime()) / (1000 * 60)),
          difficulty: 'moderate' as any, // Default difficulty level
          equipment: [],
          route: data.waypoints.length > 0 ? { waypoints: data.waypoints.map(wp => ({
            name: wp.name,
            coordinates: wp.coordinates,
            estimatedTime: new Date(wp.estimatedTime),
          })) } : undefined,
        }],
        emergencyContacts: data.emergencyContacts.map(contact => ({
          ...contact,
          notificationPreferences: {
            email: true,
            sms: true,
            immediateAlerts: true,
            dailyUpdates: false,
          }
        })),
        checkInInterval: 24, // Default 24 hour check-in interval
        status: 'planned',
        visibility: 'contacts-only',
        shareToken: crypto.randomUUID(),
        checkIns: [],
        notifications: {
          checkInReminders: true,
          emergencyEscalation: true,
          tripLinkUpdates: true,
          contactNotifications: true,
          escalationTimeHours: 2,
          reminderIntervalMinutes: 30,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to localStorage (Phase 2 persistence)
      const existingTripLinks = JSON.parse(localStorage.getItem('triplinks') || '[]');
      existingTripLinks.push(tripLink);
      localStorage.setItem('triplinks', JSON.stringify(existingTripLinks));

      setTripLinkId(newTripLinkId);
      toast.success('TripLink created successfully!');
      setCurrentStep(5); // Go to review step
    } catch (error) {
      toast.error('Failed to create TripLink');
      console.error('Error creating TripLink:', error);
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
        return <TripOverviewStep />;
      case 2:
        return <TripLinkLocationStep />;
      case 3:
        return <TripDetailsStep />;
      case 4:
        return <TripLinkContactsStep />;
      case 5:
        return (
          <div className="space-y-4">
            <AdventurePreview formData={formData} />
            {tripLinkId && <TripLinkShareLink tripLinkId={tripLinkId} />}
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
                <h1 className="text-hero mb-3">Create Your TripLink</h1>
                <p className="h6 mb-3 text-light fw-normal" style={{ opacity: 0.9 }}>
                  Outdoor Trip Planning – For recreationalists and professionals
                </p>
                <p className="lead mb-0 text-hero">
                  Plan your next outdoor trip with our comprehensive safety wizard
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
              <p className="text-muted">Follow our step-by-step wizard to create a detailed TripLink and keep your loved ones informed.</p>
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