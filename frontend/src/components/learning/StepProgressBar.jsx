import React from 'react';
import { Compass, Gauge, TrendingUp, Activity, Crosshair, Shield, BookOpen } from 'lucide-react';
import './StepProgressBar.css';

const StepProgressBar = ({ activeStep = 1, totalSteps = 7 }) => {
  const steps = [
    { label: 'Direction', Icon: Compass },
    { label: 'Strength', Icon: Gauge },
    { label: 'Price Chart', Icon: TrendingUp },
    { label: 'Flow', Icon: Activity },
    { label: 'Edge', Icon: Crosshair },
    { label: 'Risk', Icon: Shield },
    { label: 'Lesson', Icon: BookOpen },
  ];

  const renderSteps = steps.slice(0, totalSteps);

  return (
    <div className="lm-sp-container">
      <div className="lm-sp-progress-wrapper">
        <div className="lm-sp-line-bg"></div>
        <div 
          className="lm-sp-line-fill"
          style={{ width: `${(Math.max(1, Math.min(activeStep, totalSteps)) - 1) / (totalSteps - 1) * 100}%` }}
        ></div>
        {renderSteps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === activeStep;
          const isCompleted = stepNumber < activeStep;
          
          let circleClass = 'lm-sp-circle';
          if (isActive) circleClass += ' lm-sp-active';
          if (isCompleted) circleClass += ' lm-sp-completed';
          
          const Icon = step.Icon;
          
          return (
            <div key={index} className="lm-sp-step">
              <div className={circleClass}>
                <Icon className="lm-sp-icon" size={16} />
              </div>
              <div className="lm-sp-label">{step.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StepProgressBar;
