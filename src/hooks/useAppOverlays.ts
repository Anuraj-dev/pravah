import { useCallback, useState } from "react";
import type { Task } from "../types";

export function useAppOverlays() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const openTaskPopup = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const closeTaskPopup = useCallback(() => {
    setSelectedTask(null);
  }, []);

  const openQuickAdd = useCallback(() => {
    setShowQuickAdd(true);
  }, []);

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
  }, []);

  return {
    selectedTask,
    showQuickAdd,
    openTaskPopup,
    closeTaskPopup,
    openQuickAdd,
    closeQuickAdd,
  };
}
