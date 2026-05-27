"use client";

import { create } from "zustand";
import { createAssignment, fetchAssignment, regenerateAssignment, API_URL } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Assignment, AssignmentEvent, AssignmentFormValues } from "@/lib/types";

interface AssessmentState {
  assignments: Assignment[];
  assignment: Assignment | null;
  event: AssignmentEvent | null;
  loading: boolean;
  submitting: boolean;
  error: string;
  fetchList: () => Promise<void>;
  create: (values: AssignmentFormValues) => Promise<string>;
  load: (id: string) => Promise<void>;
  watch: (id: string) => () => void;
  regenerate: (id: string) => Promise<void>;
  deleteAssignment: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  assignments: [],
  assignment: null,
  event: null,
  loading: false,
  submitting: false,
  error: "",
  async fetchList() {
    set({ loading: true, error: "" });
    try {
      const response = await fetch(`${API_URL}/api/assignments`, { cache: "no-store" });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to fetch assignments");
      }
      const data = await response.json();
      set({ assignments: data });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not fetch assignments." });
    } finally {
      set({ loading: false });
    }
  },
  async create(values) {
    set({ submitting: true, error: "" });
    try {
      const created = await createAssignment(values);
      set({
        event: {
          assignmentId: created.assignmentId,
          status: "queued",
          progress: 5,
          message: "Assignment queued for AI generation."
        }
      });
      // Refresh list
      void get().fetchList();
      return created.assignmentId;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not create assignment." });
      throw error;
    } finally {
      set({ submitting: false });
    }
  },
  async load(id) {
    set({ loading: true, error: "" });
    try {
      const assignment = await fetchAssignment(id);
      set({ assignment });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not load assignment." });
    } finally {
      set({ loading: false });
    }
  },
  watch(id) {
    const socket = getSocket();
    socket.emit("assignment:watch", id);

    const handler = async (event: AssignmentEvent) => {
      if (event.assignmentId !== id) {
        return;
      }

      set({ event });
      if (event.status === "completed" || event.status === "pdf-ready" || event.status === "failed") {
        await get().load(id);
        void get().fetchList();
      }
    };

    socket.on("assignment:update", handler);
    return () => {
      socket.off("assignment:update", handler);
    };
  },
  async regenerate(id) {
    set({ submitting: true, error: "" });
    try {
      await regenerateAssignment(id);
      set({
        event: {
          assignmentId: id,
          status: "queued",
          progress: 5,
          message: "Regeneration queued."
        }
      });
      await get().load(id);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not regenerate assignment." });
    } finally {
      set({ submitting: false });
    }
  },
  async deleteAssignment(id) {
    set({ submitting: true, error: "" });
    try {
      const response = await fetch(`${API_URL}/api/assignments/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to delete assignment");
      }
      set((state) => ({
        assignments: state.assignments.filter((a) => a._id !== id),
        assignment: state.assignment?._id === id ? null : state.assignment
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Could not delete assignment." });
      throw error;
    } finally {
      set({ submitting: false });
    }
  },
  clearError() {
    set({ error: "" });
  }
}));
