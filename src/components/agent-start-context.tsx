"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const AgentStartContext = createContext<{
  starting: boolean;
  setStarting: (value: boolean) => void;
} | null>(null);

export function AgentStartProvider({ children }: { children: ReactNode }) {
  const [starting, setStarting] = useState(false);
  return <AgentStartContext.Provider value={{ starting, setStarting }}>{children}</AgentStartContext.Provider>;
}

export function useAgentStart() {
  const context = useContext(AgentStartContext);
  if (!context) throw new Error("AgentStartProvider is missing");
  return context;
}
