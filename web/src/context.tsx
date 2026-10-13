import { createContext, useContext } from "react";
import type { User } from "./types";
export interface CreateAction {
  kind: string;
  initial?: Record<string, unknown>;
  id?: string;
  version?: number;
  returnTo?: string;
  sourceKind?: string;
  sourceId?: string;
  next?: CreateAction;
}
export const WorkspaceContext = createContext<{
  user: User;
  refresh: () => Promise<void>;
  open: (action: CreateAction) => void;
  notify: (text: string) => void;
}>({ user: null!, refresh: async () => {}, open: () => {}, notify: () => {} });
export const useWorkspace = () => useContext(WorkspaceContext);
