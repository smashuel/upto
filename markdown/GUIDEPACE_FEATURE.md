# GuidePace Professional Time Estimator Feature

## Overview
GuidePace is an optional professional time estimation feature for the UpTo adventure creation form. It provides guide-quality time estimates based on terrain analysis for mountain and outdoor adventures.

## Feature Requirements

### 1. Optional Feature Toggle ✅ COMPLETED
- **Component**: Checkbox/toggle in adventure creation form
- **Label**: "Use Professional Time Estimation (GuidePace)"
- **Subtitle**: "Get guide-quality time estimates based on terrain analysis"
- **Position**: Dedicated card after basic adventure details
- **Default State**: OFF (progressive disclosure, not overwhelming for casual users)

### 2. Hover Information Tooltip ✅ COMPLETED
- **Trigger**: User hovers over info icon next to GuidePace option
- **Content**: Professional methodology details with mountain guide systems
- **Implementation**: Bootstrap OverlayTrigger with custom tooltip
- **Delay**: 250ms show, 400ms hide for optimal UX
- **Styling**: Left-aligned, max-width 320px, proper spacing and icons

**Tooltip Content:**
```
🏔️ Professional Time Estimation
Based on proven mountain guide methodology

✓ Munter Method - hiking & skiing terrain
✓ Chauvin System - scrambling & snow climbing  
✓ Technical System - roped climbing

Used by IFMGA guides worldwide for accurate
time planning and safety management.

📖 Learn more about GuidePace
```

### 3. Progressive Form Expansion ✅ COMPLETED
- **Trigger**: Automatically expands when GuidePace checkbox is enabled
- **Animation**: Smooth React conditional rendering (CSS transitions via Bootstrap)
- **Content**: Route Analysis section with terrain detection and time estimation

**Phase 1 - Automatic Analysis Section:**
```
🔍 Route Analysis (Powered by GuidePace)
   Analyzing your route...

   Detected Terrain:
   🥾 Approach hiking: 2.5 mi, +1200ft
   🧗 Technical climbing: 6 pitches, 5.7  
   ⬇️ Descent: 2.5 mi, -1200ft

   ⏱️ Estimated Total Time: 8-10 hours

   [Adjust Parameters] [View Breakdown]
```

**Implementation Details:**
- **Location**: `src/components/forms/AdventureBasicsStep.tsx:170-228`
- **Conditional Rendering**: `{useGuidePace && (...)}`
- **Styling**: Primary border, light background to distinguish from main form
- **Icons**: Search, Mountain, TrendingUp, ArrowDown, Clock, Settings, BarChart3
- **Mock Data**: Realistic climbing route analysis (approach, technical, descent)
- **Buttons**: Adjust Parameters and View Breakdown for future functionality

## Implementation Progress

### Current Step: Step 1 - Optional Feature Toggle ✅ COMPLETED
- [x] Examine current adventure creation form structure
- [x] Add GuidePace toggle component
- [x] Position as dedicated card (separate from difficulty section)
- [x] Set default state to OFF (unchecked by default)
- [x] Ensure clean integration with existing form

**Implementation Details:**
- **Location**: `src/components/forms/AdventureBasicsStep.tsx:135-167`
- **Layout**: Dedicated full-width card below main form sections
- **Component**: Checkbox with descriptive label and info icon tooltip
- **Icons**: Clock icon (size 20) + Info icon (size 16) from lucide-react
- **Form Integration**: Uses react-hook-form register for form state management
- **Styling**: Bootstrap Card variant="step" for consistency
- **Progressive Disclosure**: Unchecked by default, doesn't overwhelm casual users
- **UX Rationale**: Separated from difficulty since terrain/distance matter more for time estimation
- **Tooltip**: Professional details available on hover without cluttering main UI

### Form Improvements Made
- **Removed**: Difficulty Level section (unnecessary subjective rating)
- **Simplified**: Adventure form now focuses on practical details:
  - Title and description
  - Activity type selection
  - Optional GuidePace professional time estimation
- **Cleaner UX**: Less overwhelming for casual users, more focus on essential information

## Complete Implementation ✅

### Phase 1 - Core System COMPLETED
All major components of the GuidePace system have been implemented:

#### **Core Calculation Engine**
- **TimeCalculator.ts**: Complete implementation of all three professional methods
  - Munter Method (hiking/skiing)
  - Chauvin System (scrambling/snow climbing) 
  - Technical System (roped climbing)
  - Pace factor adjustments and safety recommendations

#### **Route Analysis System**
- **RouteAnalyzer.ts**: Intelligent terrain detection and route segmentation
  - Auto-classification of terrain types
  - Route breakdown into logical segments
  - Method selection based on route characteristics

#### **UI Components**
- **GuidePaceEstimator.tsx**: Main expandable component with analysis loading
- **RouteBreakdown.tsx**: Visual display of route segments with time estimates
- **PaceFactorControls.tsx**: Advanced parameter adjustment with real-time feedback
- **TimeEstimateSummary.tsx**: Safety recommendations and start time calculations

#### **Professional Features**
✅ Real-time time calculation updates
✅ Pace factor adjustments (fitness, weather, party size, pack weight, experience)
✅ Safety recommendations (start times, turnaround times, daylight analysis)
✅ Professional methodology tooltips and guidance
✅ Route segmentation with appropriate calculation methods
✅ Time range estimates (optimistic/realistic/conservative)

### Next Steps (Future Enhancements)
- Phase 2: Real GPX/route data integration
- Phase 3: Weather API integration for dynamic conditions
- Phase 4: Historical data and crowd-sourced validation
- Phase 5: Export functionality (PDF reports, calendar integration)
- Phase 6: Mobile-optimized interface improvements

## Technical Implementation

### File Structure
```
src/
├── components/
│   ├── forms/
│   │   └── AdventureBasicsStep.tsx (main integration)
│   └── guidepace/
│       ├── GuidePaceEstimator.tsx (main component)
│       ├── RouteBreakdown.tsx (segment display)
│       ├── PaceFactorControls.tsx (adjustable parameters)
│       └── TimeEstimateSummary.tsx (safety recommendations)
└── utils/
    ├── TimeCalculator.ts (professional formulas)
    └── RouteAnalyzer.ts (terrain detection)
```

### Integration Points
- **Form Location**: `src/components/forms/AdventureBasicsStep.tsx:171`
- **Conditional Rendering**: Appears only when GuidePace toggle is enabled
- **Real-time Updates**: Time estimates update immediately when pace factors change
- **Professional Methodology**: Uses proven mountain guide calculation systems

### Approach
- Progressive enhancement of existing adventure creation form
- Clean, optional feature that doesn't disrupt casual users
- Professional-grade calculations for serious adventurers
- Comprehensive safety recommendations and timing guidance