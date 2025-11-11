"use client";

import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ArrowUp } from "@phosphor-icons/react";

interface ChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  onSend: () => void;
  isLoading: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onKeyDown,
  disabled,
  onSend,
  isLoading,
}) => {
  return (
    <div className="w-full p-3 border border-border rounded-2xl">
      <div className="flex space-x-2">
        <Textarea
          placeholder="Type your message here..."
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          className="text-white"
          disabled={disabled}
        />
        <Button
          variant="icon"
          size="iconSize"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="self-end"
        >
          {isLoading ? (
            <div className="w-5 h-5 flex items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <div className="w-5 h-5 flex items-center justify-center">
              <ArrowUp />
            </div>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ChatInput; 