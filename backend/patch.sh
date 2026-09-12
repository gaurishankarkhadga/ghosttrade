#!/bin/bash
# Remove everything from export default function AiMessageBubble down
sed -i '/export default function AiMessageBubble/,$d' ../frontend/src/components/AiMessageBubble.jsx

# Append it back with the changes
cat << 'INNER_EOF' >> ../frontend/src/components/AiMessageBubble.jsx
export default function AiMessageBubble({ message }) {
  const { isSimpleMode } = useGhostStore();
  const isFullWidth = message.uiComponent === 'TRADE_CARD' || message.uiComponent === 'LEARNING_MODE' || isSimpleMode;
  
  const [isNewMessage] = useState(message.isGenerating === true);

  const smoothedContent = useStreamSmoother(message.content, !isNewMessage);
  
  const isStreaming = (message.content || '') !== smoothedContent || message.isGenerating;

  return (
    <div className={`message-wrapper ai ${isFullWidth ? 'full-width' : ''}`}>
      <div className="message-content">
        {isSimpleMode && message.tradeData ? (
           <LearningModeBubble tradeData={message.tradeData} content={smoothedContent} />
        ) : (
          <>
            {smoothedContent && (
              <InstitutionalReport content={smoothedContent} isStreaming={isStreaming} />
            )}
            
            {message.uiComponent === 'TRADE_CARD' && message.tradeData && (
              <TradeExecutionCard {...message.tradeData} isParentStreaming={isStreaming} isNewMessage={isNewMessage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
INNER_EOF
