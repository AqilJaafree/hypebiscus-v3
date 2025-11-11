"use client";

import React from "react";

interface ChatMessageProps {
  message: {
    role: string;
    content: string;
    timestamp?: Date;
  };
  streamingMessage?: string | null;
  isStreaming?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, streamingMessage, isStreaming }) => {
  const isUser = message.role === "user";

  // Format message content with line breaks
  // React automatically provides XSS protection for text content
  const formattedContent = message.content.split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < message.content.split("\n").length - 1 && <br />}
    </React.Fragment>
  ));

  // Format streaming message content with line breaks if available
  const formattedStreamingContent = streamingMessage?.split("\n").map((line, i) => (
    <React.Fragment key={i}>
      {line}
      {i < streamingMessage.split("\n").length - 1 && <br />}
    </React.Fragment>
  ));

  // Check if this is a welcome message
  const isWelcomeMessage = !isUser && 
    (message.content.includes("Welcome to Hypebiscus") || 
     message.content.includes("portfolio style") || 
     message.content.toLowerCase().includes("welcome"));

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-full ${
          isUser
            ? "bg-white/10 border border-border text-white text-left rounded-full py-2 px-4"
            : isWelcomeMessage 
              ? "pt-8" 
              : "pt-0"
        }`}
      >
        <p>
          {!isUser && isStreaming && formattedStreamingContent 
            ? formattedStreamingContent 
            : formattedContent}
          
          {!isUser && isStreaming && <span className="inline-block animate-pulse">▌</span>}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage; 