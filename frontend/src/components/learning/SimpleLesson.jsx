import React from 'react';
import { BookOpen, Lightbulb } from 'lucide-react';
import './SimpleLesson.css';

const SimpleLesson = ({ educationalLesson, direction }) => {
  const defaultLesson = {
    beginnerLesson: "Ghostrade is analyzing the market for you. Each analytical setup teaches you something new.",
    coreTakeaway: "Focus on understanding the rationale behind the signals to improve your analytical edge over time."
  };

  const lessonToUse = educationalLesson || defaultLesson;

  return (
    <section className="lm-sl-container">
      <div className="lm-sl-header">
        <BookOpen className="lm-sl-icon" size={24} />
        <h2 className="lm-sl-title">What You Should Learn</h2>
      </div>
      
      <div className="lm-sl-content">
        <p className="lm-sl-main-text">
          {lessonToUse.beginnerLesson}
        </p>
        
        {lessonToUse.coreTakeaway && (
          <div className="lm-sl-takeaway">
            <Lightbulb className="lm-sl-takeaway-icon" size={20} />
            <p className="lm-sl-takeaway-text">{lessonToUse.coreTakeaway}</p>
          </div>
        )}
      </div>

      <div className="lm-sl-disclaimer">
        This is for learning only. Not financial advice. Past performance does not guarantee future results.
      </div>
    </section>
  );
};

export default SimpleLesson;
