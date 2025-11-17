
import React from 'react';

interface PipelineStepperProps {
  currentStep: 'curator' | 'annotator' | 'qc';
  batchProgress?: string;
}

const Step: React.FC<{
  stepNumber: number;
  label: string;
  isCurrent: boolean;
  isCompleted: boolean;
}> = ({ stepNumber, label, isCurrent, isCompleted }) => {
  return (
    <div className="flex items-center">
      <div className={`flex items-center ${isCurrent || isCompleted ? 'text-rose-600 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'}`}>
        <div
          className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
            isCompleted
              ? 'bg-rose-700 border-rose-700 text-white'
              : isCurrent
              ? 'border-rose-600'
              : 'border-gray-300 dark:border-gray-500'
          }`}
        >
          {isCompleted ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <span className={isCurrent ? 'font-bold' : ''}>{stepNumber}</span>
          )}
        </div>
        <span className={`ml-2 text-sm font-medium ${isCurrent ? 'font-bold' : ''}`}>{label}</span>
      </div>
    </div>
  );
};


const PipelineStepper: React.FC<PipelineStepperProps> = ({ currentStep, batchProgress }) => {
  const steps = [
    { id: 'curator', label: 'Curate' },
    { id: 'annotator', label: 'Annotate' },
    { id: 'qc', label: 'QC & Finalize' },
  ];

  const currentIndex = steps.findIndex(step => step.id === currentStep);

  return (
    <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Pipeline Progress</h3>
        {batchProgress && <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{batchProgress}</span>}
      </div>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <Step
              stepNumber={index + 1}
              label={step.label}
              isCurrent={index === currentIndex}
              isCompleted={index < currentIndex}
            />
            {index < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 rounded transition-colors duration-500 ${index < currentIndex ? 'bg-rose-700' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default PipelineStepper;
