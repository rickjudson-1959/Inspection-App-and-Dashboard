// GuidedTour.jsx - Guided tour component using react-joyride
// Helps users learn how to use different parts of the application

import React, { useState, useEffect } from 'react'
import Joyride, { STATUS, ACTIONS, EVENTS } from 'react-joyride'

// Custom styles for the tour
const tourStyles = {
  options: {
    primaryColor: '#1976d2',
    textColor: '#333',
    backgroundColor: '#fff',
    arrowColor: '#fff',
    overlayColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10000
  },
  buttonNext: {
    backgroundColor: '#1976d2',
    color: '#fff',
    borderRadius: '4px',
    padding: '8px 16px'
  },
  buttonBack: {
    color: '#666',
    marginRight: '10px'
  },
  buttonSkip: {
    color: '#999'
  },
  tooltip: {
    borderRadius: '8px',
    padding: '15px'
  },
  tooltipTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '10px'
  },
  tooltipContent: {
    fontSize: '14px',
    lineHeight: '1.5'
  }
}

// Hook for managing tour state
export function useGuidedTour(tourKey, steps) {
  const storageKey = `tour_completed_${tourKey}`

  const [runTour, setRunTour] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  // Check if tour has been completed before
  useEffect(() => {
    const completed = localStorage.getItem(storageKey)
    if (!completed) {
      // Delay tour start to let the page render
      const timer = setTimeout(() => {
        setRunTour(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [storageKey])

  const handleTourCallback = (data) => {
    const { status, action, type, index } = data

    // Update step index for controlled tour
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1))
    }

    // Handle tour completion or skip
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRunTour(false)
      setStepIndex(0)
      localStorage.setItem(storageKey, 'true')
    }
  }

  const startTour = () => {
    setStepIndex(0)
    setRunTour(true)
  }

  const resetTour = () => {
    localStorage.removeItem(storageKey)
    setStepIndex(0)
    setRunTour(true)
  }

  return {
    runTour,
    stepIndex,
    handleTourCallback,
    startTour,
    resetTour
  }
}

// Main GuidedTour component
export default function GuidedTour({
  steps,
  run,
  stepIndex,
  onCallback,
  continuous = true,
  showProgress = true,
  showSkipButton = true,
  disableOverlayClose = true
}) {
  if (!steps || steps.length === 0) {
    return null
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      callback={onCallback}
      continuous={continuous}
      showProgress={showProgress}
      showSkipButton={showSkipButton}
      disableOverlayClose={disableOverlayClose}
      styles={tourStyles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Got it!',
        next: 'Next',
        skip: 'Skip Tour'
      }}
      floaterProps={{
        disableAnimation: false
      }}
    />
  )
}

// Help button component to restart tour
export function TourHelpButton({ onClick, style = {} }) {
  return (
    <button
      onClick={onClick}
      title="Take a guided tour"
      style={{
        padding: '8px 12px',
        backgroundColor: '#17a2b8',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '13px',
        ...style
      }}
    >
      <span style={{ fontSize: '16px' }}>?</span>
      <span>Tour</span>
    </button>
  )
}

// Tour step definitions for different pages
export const TOUR_STEPS = {
  inspectorReport: [
    {
      target: '[data-tour="header"]',
      title: 'Welcome to Inspector Report',
      content: 'This is where you create your daily inspection reports. Let me walk you through the key features.',
      placement: 'bottom',
      disableBeacon: true
    },
    {
      target: '[data-tour="date-picker"]',
      title: 'Select Report Date',
      content: 'Choose the date for your report. You can view or edit reports from previous days by selecting a different date.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="weather"]',
      title: 'Weather Conditions',
      content: 'Record the weather conditions for the day. This information is important for tracking work delays and conditions.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="safety-section"]',
      title: 'Safety Section',
      content: 'Document any safety observations, incidents, or notes. Safety is always the top priority on pipeline projects.',
      placement: 'top'
    },
    {
      target: '[data-tour="activity-blocks"]',
      title: 'Activity Blocks',
      content: 'This is the main area where you add your inspection activities. Each block represents one activity or observation.',
      placement: 'top'
    },
    {
      target: '[data-tour="add-activity"]',
      title: 'Add New Activity',
      content: 'Click here to add a new activity block. You can add multiple activities to a single report.',
      placement: 'left'
    },
    {
      target: '[data-tour="save-button"]',
      title: 'Save Your Report',
      content: 'Don\'t forget to save your report! You can save as a draft and continue editing, or submit when complete.',
      placement: 'top'
    },
    {
      target: '[data-tour="doc-search"]',
      title: 'Document Search',
      content: 'Need to reference project documents? Use the AI-powered document search to quickly find specifications, procedures, and standards.',
      placement: 'left'
    }
  ],

  chiefDashboard: [
    {
      target: '[data-tour="overview-tab"]',
      title: 'Dashboard Overview',
      content: 'The Overview tab shows key metrics, pending approvals, and project status at a glance.',
      placement: 'bottom',
      disableBeacon: true
    },
    {
      target: '[data-tour="reports-tab"]',
      title: 'Daily Reports',
      content: 'Review and approve inspector daily reports. You can filter by date, inspector, or status.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="approval-queue"]',
      title: 'Approval Queue',
      content: 'Reports pending your review appear here. Click on a report to review details and approve or request changes.',
      placement: 'bottom'
    }
  ],

  adminPortal: [
    {
      target: '[data-tour="admin-tabs"]',
      title: 'Admin Portal Navigation',
      content: 'Use these tabs to access different administrative functions: Overview, Approvals, Reports, Users, and more.',
      placement: 'bottom',
      disableBeacon: true
    },
    {
      target: '[data-tour="user-management"]',
      title: 'User Management',
      content: 'Add, edit, or deactivate users. Assign roles and manage team permissions.',
      placement: 'bottom'
    },
    {
      target: '[data-tour="setup-tab"]',
      title: 'Project Setup',
      content: 'Configure project settings, upload documents, and manage organizational settings.',
      placement: 'bottom'
    }
  ]
}
