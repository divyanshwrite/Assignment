"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Home as HomeIcon,
  Users,
  ClipboardList,
  Wand2,
  Library,
  Settings,
  ArrowLeft,
  LayoutGrid,
  Bell,
  ChevronDown,
  Plus,
  Sparkles,
  X,
  Menu,
  CheckCircle,
  MoreVertical,
  Filter,
  Search,
  BookOpen,
  CalendarDays,
  FileUp,
  RefreshCw,
  Download,
  AlertCircle,
  Loader2
} from "lucide-react";
import { useAssessmentStore } from "@/store/assessmentStore";
import { pdfUrl } from "@/lib/api";
import type { QuestionType, Difficulty, Assignment, QuestionPlanItem, AssignmentStatus } from "@/lib/types";

interface PlanRow {
  id: number;
  type: QuestionType;
  count: number;
  marks: number;
}

const FALLBACK_OPTION_TEXT = [
  "A correct concept based on the lesson content",
  "A common misconception about the topic",
  "A partially correct but incomplete idea",
  "An unrelated statement"
];

function ensureFourOptions(options?: string[]): string[] {
  const letters = ["A", "B", "C", "D"];
  const cleaned = (options ?? [])
    .map((option) => (option ?? "").trim())
    .filter(Boolean);

  const padded = cleaned.length >= 4
    ? cleaned.slice(0, 4)
    : [...cleaned, ...FALLBACK_OPTION_TEXT.slice(cleaned.length)].slice(0, 4);

  return padded.map((option, index) => {
    const stripped = option.replace(/^\s*[A-Da-d][.)\-:]\s*/, "").trim();
    return `${letters[index]}. ${stripped || `Option ${letters[index]}`}`;
  });
}

export default function Home() {
  const {
    assignments,
    assignment,
    event,
    loading,
    submitting,
    error,
    fetchList,
    create,
    load,
    watch,
    regenerate,
    deleteAssignment,
    clearError
  } = useAssessmentStore();

  // Navigation & Active Tab
  const [activeTab, setActiveTab] = useState("Assignments");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [bellRinging, setBellRinging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Creator Mode & Output Views
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Custom context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    assignmentId: string | null;
  }>({ visible: false, x: 0, y: 0, assignmentId: null });

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState("All");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  // Form Fields
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("Class 10 - A");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");

  // Question Rows inside Wizard
  const [questionRows, setQuestionRows] = useState<PlanRow[]>([
    { id: 1, type: "multiple-choice", count: 4, marks: 1 },
    { id: 2, type: "short-answer", count: 3, marks: 2 },
    { id: 3, type: "long-answer", count: 2, marks: 5 },
    { id: 4, type: "case-study", count: 1, marks: 8 }
  ]);

  // Load assignments list on mount
  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Click / Scroll listener to dismiss floating dropdowns and context menus
  useEffect(() => {
    const handleClose = () => {
      setContextMenu({ visible: false, x: 0, y: 0, assignmentId: null });
      setIsFilterDropdownOpen(false);
    };
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, []);

  // WebSockets live generation status watcher
  useEffect(() => {
    if (!selectedId) return;

    // Load active assignment details
    void load(selectedId);

    // Watch for WebSocket status/progress events
    const cleanup = watch(selectedId);
    return cleanup;
  }, [selectedId, load, watch]);

  // Show a visual success toast
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Toast auto-clear when store triggers API errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Wizard Configuration Handlers
  const handleCountChange = (id: number, delta: number) => {
    setQuestionRows(
      questionRows.map((row) =>
        row.id === id ? { ...row, count: Math.max(1, row.count + delta) } : row
      )
    );
  };

  const handleMarksChange = (id: number, delta: number) => {
    setQuestionRows(
      questionRows.map((row) =>
        row.id === id ? { ...row, marks: Math.max(1, row.marks + delta) } : row
      )
    );
  };

  const handleRowTypeChange = (id: number, type: QuestionType) => {
    setQuestionRows(
      questionRows.map((row) => (row.id === id ? { ...row, type } : row))
    );
  };

  const handleRowDelete = (id: number) => {
    setQuestionRows(questionRows.filter((row) => row.id !== id));
  };

  const handleAddRow = () => {
    const nextId = questionRows.length > 0 ? Math.max(...questionRows.map((r) => r.id)) + 1 : 1;
    setQuestionRows([
      ...questionRows,
      { id: nextId, type: "multiple-choice", count: 1, marks: 1 }
    ]);
  };

  // Submit form values to create new assignment (Triggering BullMQ + WebSockets queue)
  const handleCreateAssignmentWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return showToast("Title is required!");
    if (!subject.trim()) return showToast("Subject is required!");
    if (!grade.trim()) return showToast("Grade or Class is required!");
    if (!dueDate) return showToast("Due date is required!");
    {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(dueDate);
      selected.setHours(0, 0, 0, 0);
      if (selected.getTime() < today.getTime()) {
        return showToast("Due date cannot be in the past!");
      }
    }
    if (questionRows.length === 0) return showToast("Add at least one question type!");

    try {
      const assignmentId = await create({
        title: title.trim(),
        subject: subject.trim(),
        grade: grade.trim(),
        dueDate,
        instructions: instructions.trim(),
        sourceFile: uploadedFile,
        questionPlan: questionRows.map((row) => ({
          type: row.type,
          count: row.count,
          marks: row.marks
        }))
      });

      setSelectedId(assignmentId);
      setIsCreateMode(false);
      showToast("Assignment queued for AI generation!");

      // Reset wizard fields
      setTitle("");
      setSubject("");
      setGrade("Class 10 - A");
      setDueDate("");
      setInstructions("");
      setUploadedFile(null);
      setUploadedFileName("");
    } catch (err) {
      console.error("Could not create assessment", err);
    }
  };

  // Triggering regeneration on the active question paper
  const handleRegenerate = async (id: string) => {
    try {
      await regenerate(id);
      showToast("Regeneration queued successfully!");
    } catch (err) {
      console.error(err);
    }
  };

  // Delete assignment and refresh dashboard
  const handleDeleteAssignment = async (id: string, name: string) => {
    try {
      await deleteAssignment(id);
      showToast(`Assignment "${name}" removed successfully.`);
      setContextMenu({ visible: false, x: 0, y: 0, assignmentId: null });
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch (err) {
      console.error("Could not delete", err);
    }
  };

  // Bell ring notification trigger
  const handleBellHover = () => {
    setBellRinging(true);
    setTimeout(() => setBellRinging(false), 450);
  };

  // Filtering & Searching assignments list
  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGroup = filterGroup === "All" || item.grade === filterGroup;
      return matchesSearch && matchesGroup;
    });
  }, [assignments, searchQuery, filterGroup]);

  // Labels for questions rendering
  const labelForType = (type: QuestionType) => {
    const labels: Record<QuestionType, string> = {
      "multiple-choice": "Multiple Choice",
      "short-answer": "Short Answer",
      "long-answer": "Long Answer",
      "case-study": "Case Study"
    };
    return labels[type] || type;
  };

  const labelDifficulty = (diff: Difficulty | string) => {
    if (diff === "medium") return "Moderate";
    return diff.charAt(0).toUpperCase() + diff.slice(1);
  };

  const formatDate = (dateString: string | Date) => {
    try {
      return new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }).format(new Date(dateString));
    } catch {
      return String(dateString).slice(0, 10);
    }
  };

  // Determine active status/progress to display in socket updates.
  // Once the paper exists or the persisted status is terminal, prefer that
  // over any later socket event (e.g. "pdf-ready") so the UI never falls
  // back to the loading view after the paper is ready.
  const activeEvent = selectedId && event?.assignmentId === selectedId ? event : null;
  const persistedStatus = assignment?.status;
  const paperReady = Boolean(assignment?.result) || persistedStatus === "completed";
  const currentStatus: AssignmentStatus | "pdf-ready" = paperReady
    ? "completed"
    : persistedStatus === "failed"
      ? "failed"
      : (activeEvent?.status ?? persistedStatus ?? "queued");
  const currentProgress = paperReady ? 100 : (activeEvent?.progress ?? 5);
  const currentMessage = paperReady
    ? "Ready"
    : (activeEvent?.message ?? "Waiting in queue...");

  return (
    <div className="flex h-screen w-screen p-3 md:p-4 gap-3 md:gap-5 bg-[#F1F3F5] relative overflow-hidden font-sans select-none">

      {/* 1. DESKTOP SIDEBAR */}
      <aside className="w-[270px] bg-white rounded-[24px] flex flex-col p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] shrink-0 z-10 h-[calc(100vh-32px)] relative justify-between hidden md:flex border border-slate-100">
        <div className="flex flex-col gap-5">
          {/* VedaAI Logo */}
          <div className="flex items-center gap-3 pl-1 mb-2">
            <div className="w-12 h-12 rounded-[14px] overflow-hidden flex items-center justify-center shadow-[0_6px_16px_rgba(255,94,58,0.25)] shrink-0">
              <img
                src="/avatars/school.png"
                alt="VedaAI logo"
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-[28px] font-extrabold text-[#1F2937] tracking-tight leading-none">VedaAI</h1>
          </div>

          {/* Create Button */}
          <button
            className="flex items-center justify-center gap-2 bg-[#1E293B] hover:bg-[#0F172A] text-white border-2 border-primary rounded-full py-3 px-5 text-[14.5px] font-semibold cursor-pointer shadow-[0_4px_12px_rgba(255,94,58,0.15)] hover:shadow-[0_5px_15px_rgba(255,94,58,0.3)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 w-full mb-3"
            onClick={() => { setIsCreateMode(true); setSelectedId(null); setActiveTab("Assignments"); }}
          >
            <Sparkles className="animate-pulse text-[#FF5E3A]" fill="#FF5E3A" size={14} />
            <span>Create Assignment</span>
          </button>

          {/* Sidebar Navigation */}
          <nav className="flex flex-col gap-1.5 list-none">
            <li className="w-full">
              <a
                href="#home"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-500 text-[14.5px] font-semibold hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "Home" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("Home"); setIsCreateMode(false); setSelectedId(null); }}
              >
                <HomeIcon className="w-4.5 h-4.5 opacity-80" />
                <span>Home</span>
              </a>
            </li>
            <li className="w-full">
              <a
                href="#groups"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-500 text-[14.5px] font-semibold hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "My Groups" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("My Groups"); setIsCreateMode(false); setSelectedId(null); }}
              >
                <Users className="w-4.5 h-4.5 opacity-80" />
                <span>My Groups</span>
              </a>
            </li>
            <li className="w-full">
              <a
                href="#assignments"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-500 text-[14.5px] font-semibold hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "Assignments" && !isCreateMode && !selectedId ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("Assignments"); setIsCreateMode(false); setSelectedId(null); }}
              >
                <ClipboardList className="w-4.5 h-4.5 opacity-80" />
                <span>Assignments</span>

                {assignments.length > 0 && (
                  <span className="bg-[#FF5E3A] text-white text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto min-w-[20px] text-center shadow-sm">
                    {assignments.length}
                  </span>
                )}
              </a>
            </li>
            <li className="w-full">
              <a
                href="#toolkit"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-500 text-[14.5px] font-semibold hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "AI Toolkit" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("AI Toolkit"); setIsCreateMode(false); setSelectedId(null); }}
              >
                <Wand2 className="w-4.5 h-4.5 opacity-80" />
                <span>AI Teacher&apos;s Toolkit</span>
              </a>
            </li>
            <li className="w-full">
              <a
                href="#library"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-500 text-[14.5px] font-semibold hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "My Library" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("My Library"); setIsCreateMode(false); setSelectedId(null); }}
              >
                <Library className="w-4.5 h-4.5 opacity-80" />
                <span>My Library</span>
                <span className="bg-[#FF5E3A] text-white text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto min-w-[20px] text-center shadow-sm">
                  32
                </span>
              </a>
            </li>
          </nav>
        </div>

        {/* Sidebar Bottom Profile/Settings */}
        <div className="flex flex-col gap-4 mt-auto">
          <a
            href="#settings"
            className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-500 text-[14.5px] font-semibold hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "Settings" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
            onClick={() => { setActiveTab("Settings"); setIsCreateMode(false); }}
          >
            <Settings className="w-4.5 h-4.5 opacity-80" />
            <span>Settings</span>
          </a>

          {/* School Card with customized Ape Avatar */}
          <div className="flex items-center gap-3 bg-slate-100/80 rounded-[18px] p-3 hover:bg-slate-200/50 transition-all duration-200 cursor-pointer">
            <div className="w-11 h-11 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center shrink-0 shadow-sm">
              <img
                src="/avatars/profile.png"
                alt="Delhi Public School logo"
                className="w-full h-full object-cover"
                width={44}
                height={44}
              />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="font-bold text-[13.5px] text-slate-800 truncate">Delhi Public School</span>
              <span className="text-[11.5px] text-slate-400 truncate mt-0.5 font-medium">Bokaro Steel City</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. RIGHT MAIN WORKSPACE SECTION */}
      <main className="flex flex-col flex-grow gap-4 h-full md:h-[calc(100vh-32px)] overflow-hidden w-full relative">

        {/* TOP FLOATING HEADER CARD */}
        <header className="h-[60px] md:h-16 bg-white rounded-[16px] md:rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex items-center justify-between px-4 md:px-5 shrink-0 z-20 border border-slate-100">
          <div className="hidden md:flex items-center gap-3">
            <button
              className="bg-none border-none cursor-pointer flex items-center justify-center p-2 rounded-full text-slate-600 hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200"
              aria-label="Go back"
              onClick={() => {
                if (isCreateMode) setIsCreateMode(false);
                else if (selectedId) setSelectedId(null);
              }}
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="flex items-center gap-2 text-[#9CA3AF] text-[15px] font-medium">
              <span className="font-semibold tracking-tight">Assignment</span>
              {selectedId && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="text-slate-700 font-bold max-w-[200px] truncate">{assignment?.title}</span>
                </>
              )}
            </div>
          </div>

          {/* Mobile Left */}
          <div className="md:hidden flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[10px] overflow-hidden flex items-center justify-center shadow-[0_4px_10px_rgba(255,94,58,0.25)] shrink-0">
              <img
                src="/avatars/school.png"
                alt="VedaAI logo"
                width={36}
                height={36}
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-[20px] font-extrabold text-slate-800 tracking-tight leading-none">VedaAI</h1>
          </div>

          {/* Header Right */}
          <div className="flex items-center gap-3.5">
            <button
              className={`bg-none border-none cursor-pointer flex items-center justify-center p-2 rounded-full text-slate-500 hover:bg-[#F3F4F6] relative transition-all duration-200 ${bellRinging ? "anim-bell" : ""}`}
              onMouseEnter={handleBellHover}
              aria-label="Notifications"
            >
              <Bell size={19} />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#FF5E3A] rounded-full border border-white"></span>
            </button>

            {/* Profile Dropdown */}
            <button className="flex items-center gap-2 bg-none border-none cursor-pointer p-1 rounded-xl hover:bg-[#F3F3F3] transition-all duration-200">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center shadow-sm shrink-0">
                <img
                  src="/avatars/profile.png"
                  alt="John Doe profile"
                  className="w-full h-full object-cover"
                  width={32}
                  height={32}
                />
              </div>
              <span className="hidden md:inline font-bold text-[14px] text-slate-700">John Doe</span>
              <ChevronDown className="hidden md:inline text-slate-400 w-4 h-4" />
            </button>

            {/* Mobile Hamburger */}
            <button className="md:hidden flex items-center justify-center p-2 rounded-full text-slate-600 hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer" onClick={() => setIsMobileDrawerOpen(true)} aria-label="Open sidebar menu">
              <Menu size={20} strokeWidth={2.5} />
            </button>
          </div>
        </header>

        {/* MAIN CANVAS SCROLLABLE WORKSPACE AREA */}
        <section className="flex-grow flex flex-col overflow-y-auto relative pb-28 px-1">

          {/* API ERROR BAR */}
          {error ? (
            <div className="mx-auto w-full max-w-[800px] mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 animate-[fade-in_0.3s_ease]">
              <AlertCircle className="shrink-0 mt-0.5" size={17} />
              <div className="flex-grow">
                <h4 className="font-extrabold text-[14px]">Action Failed</h4>
                <p className="text-[12.5px] mt-0.5">{error}</p>
              </div>
              <button className="text-red-500 hover:text-red-800 p-1" onClick={clearError}>
                <X size={15} />
              </button>
            </div>
          ) : null}

          {selectedId ? (
            /* WET OR FULLY GENERATED QUESTION PAPER PANEL (Socket / Dynamic) */
            <div className="w-full h-full flex flex-col relative animate-[fade-in_0.4s_ease] select-none max-w-[840px] mx-auto no-print px-3 md:px-4">

              {/* Back breadcrumb bar */}
              <div className="flex items-center justify-between w-full mb-5 mt-1 px-1">
                <div className="flex items-center gap-3">
                  <button
                    className="w-10 h-10 rounded-full bg-slate-200/50 hover:bg-slate-200/80 flex items-center justify-center transition-all border-none cursor-pointer shadow-sm"
                    onClick={() => { setSelectedId(null); }}
                  >
                    <ArrowLeft size={16} className="text-slate-800" strokeWidth={2.5} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="text-slate-500 w-4.5 h-4.5 animate-[spin-sparkle_4s_infinite_linear]" />
                    <span className="text-[15px] font-extrabold text-slate-800">
                      {currentStatus === "completed" ? "Generated Question Paper" : "Generating Assessment"}
                    </span>
                  </div>
                </div>
              </div>

              {currentStatus !== "completed" && currentStatus !== "failed" ? (
                /* LIVE GENERATION PROGRESS VIEW (WebSocket updates) */
                <div className="bg-[#2A3441] text-white p-8 rounded-[24px] shadow-lg flex flex-col gap-6 w-full max-w-[760px] mx-auto my-auto items-center text-center">
                  <div className="relative w-20 h-20 flex items-center justify-center bg-slate-700/50 rounded-full border border-slate-600 shadow-md">
                    <Loader2 className="animate-spin text-[#FF5E3A]" size={36} />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white mt-12">{currentProgress}%</span>
                  </div>
                  <div className="flex flex-col gap-2 max-w-md">
                    <h3 className="text-lg font-bold">Designing Assessment Structures...</h3>
                    <p className="text-[13px] text-slate-300 leading-relaxed font-medium">
                      {currentMessage}
                    </p>
                  </div>

                  {/* Progress Track */}
                  <div className="w-full bg-slate-800/80 h-3 rounded-full overflow-hidden border border-slate-700 mt-2">
                    <div
                      className="bg-gradient-to-r from-[#FF5E3A] to-[#FF8C68] h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${currentProgress}%` }}
                    ></div>
                  </div>
                  <span className="text-[11.5px] text-slate-400 font-semibold tracking-wide uppercase">
                    MongoDB + Redis + BullMQ active
                  </span>
                </div>
              ) : currentStatus === "failed" ? (
                /* FAILED VIEW */
                <div className="bg-red-50 border border-red-200 text-red-900 p-8 rounded-[24px] shadow-sm flex flex-col gap-5 w-full max-w-[760px] mx-auto my-auto items-center text-center">
                  <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                    <AlertCircle size={28} />
                  </div>
                  <div className="flex flex-col gap-1.5 max-w-md">
                    <h3 className="text-lg font-extrabold">Generation Failed</h3>
                    <p className="text-[13px] text-red-700 leading-relaxed">
                      {assignment?.error || "An unexpected error occurred during document construction."}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="bg-[#1E293B] hover:bg-[#0F172A] text-white border-none rounded-full py-2.5 px-6 text-[13px] font-extrabold cursor-pointer transition-all flex items-center gap-1.5"
                      onClick={() => assignment && handleRegenerate(assignment._id)}
                    >
                      <RefreshCw size={14} />
                      Retry Generation
                    </button>
                    <button
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-full py-2.5 px-6 text-[13px] font-extrabold cursor-pointer transition-all"
                      onClick={() => setSelectedId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : assignment?.result ? (
                /* DYNAMIC PRINTABLE DOCUMENT (loaded from MongoDB result field) */
                <>
                  {/* Top Slate Message Card */}
                  <div className="bg-[#2A3441] text-white p-6 rounded-t-[24px] shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <p className="text-[14.5px] font-semibold leading-relaxed tracking-tight max-w-lg">
                      Certainly! Here is your custom-generated <span className="underline decoration-[#FF5E3A] underline-offset-4 decoration-2">Question Paper</span> on <strong>{assignment.subject}</strong> for <strong>{assignment.grade}</strong>:
                    </p>
                    <div className="flex gap-2.5 shrink-0 w-full sm:w-auto">
                      <a
                        className="bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-[12.5px] py-2 px-5.5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] border-none cursor-pointer transition-all flex items-center gap-1.5 text-center justify-center flex-grow sm:flex-grow-0"
                        href={pdfUrl(assignment._id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={14} className="text-slate-700" />
                        <span>Download PDF</span>
                      </a>
                    </div>
                  </div>

                  {/* Printable Question Paper Document Sheet Container */}
                  <div className="printable-paper bg-white rounded-b-[24px] p-8 md:p-12 shadow-[0_12px_40px_rgba(0,0,0,0.02)] border-x border-b border-slate-100/80 flex flex-col gap-6 w-full">

                    {/* School Header Title */}
                    <div className="text-center flex flex-col items-center">
                      <h3 className="text-xl md:text-[22px] font-extrabold text-slate-800 tracking-tight leading-snug">
                        Delhi Public School, Sector-4, Bokaro
                      </h3>
                      <span className="text-[14px] font-bold text-slate-500 uppercase tracking-wider mt-2">Subject: {assignment.result.subject}</span>
                      <span className="text-[14px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Class: {assignment.result.grade}</span>
                    </div>

                    {/* Metadata Row */}
                    <div className="flex justify-between items-center text-[13px] font-extrabold text-slate-600 border-b border-slate-100 pb-4 mt-4">
                      <span>Time Allowed: 45 minutes</span>
                      <span>Maximum Marks: {assignment.result.totalMarks}</span>
                    </div>

                    {/* Instructions */}
                    <p className="text-center font-bold text-[13.5px] text-slate-800 italic mt-2">
                      {assignment.instructions || "All questions are compulsory unless stated otherwise."}
                    </p>

                    {/* Fields for student details */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-[13px] font-extrabold text-slate-700 mt-2 bg-[#FAFBFB] p-4 rounded-xl border border-slate-100 no-print">
                      <div className="flex items-center gap-1.5">
                        Name: <input type="text" className="bg-transparent border-b border-slate-300 outline-none w-48 font-normal text-slate-800 text-[12.5px] pb-0.5" placeholder="Enter student name" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        Roll Number: <input type="text" className="bg-transparent border-b border-slate-300 outline-none w-32 font-normal text-slate-800 text-[12.5px] pb-0.5" placeholder="Enter roll number" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        Section: <input type="text" className="bg-transparent border-b border-slate-300 outline-none w-20 font-normal text-slate-800 text-[12.5px] pb-0.5" placeholder="Section" />
                      </div>
                    </div>

                    {/* Static fields for print */}
                    <div className="hidden print:flex justify-between gap-4 text-[13px] font-extrabold text-slate-800 mt-2">
                      <div>Name: ______________________</div>
                      <div>Roll Number: _________________</div>
                      <div>Section: ___________</div>
                    </div>

                    {/* Question Sections Mapping */}
                    {assignment.result.sections.map((sec, secIdx) => (
                      <div key={sec.id || secIdx} className="flex flex-col gap-5 mt-4">

                        {/* Section Divider */}
                        <div className="text-center border-y border-dashed border-slate-200 py-2 my-2 break-inside-avoid">
                          <span className="text-[13.5px] font-extrabold text-slate-800 uppercase tracking-widest">
                            Section {sec.id}
                          </span>
                        </div>

                        {/* Section Sub-headings */}
                        <div className="flex flex-col gap-0.5 break-inside-avoid">
                          <h4 className="text-[14.5px] font-extrabold text-slate-800">{sec.title}</h4>
                          <p className="text-[12px] text-slate-400 font-bold italic">{sec.instruction}</p>
                        </div>

                        {/* Questions List Block */}
                        <div className="flex flex-col gap-4 mt-2">
                          {sec.questions.map((q, idx) => (
                            <div key={q.id || idx} className="flex justify-between items-start gap-4 break-inside-avoid text-[13px] leading-relaxed text-slate-800 font-medium">
                              <div className="flex gap-2.5">
                                <span className="font-extrabold text-slate-500 shrink-0">{idx + 1}.</span>
                                <div className="flex flex-col gap-1.5">
                                  <p>{q.text}</p>

                                  {/* MCQ options (always render four) */}
                                  {q.type === "multiple-choice" ? (
                                    <ol className="flex flex-col gap-1.5 mt-1.5 list-none pl-0">
                                      {ensureFourOptions(q.options).map((opt, oi) => (
                                        <li
                                          key={`${q.id || idx}-opt-${oi}`}
                                          className="text-[12.5px] font-semibold text-slate-700 bg-slate-50 border border-slate-200/70 rounded-lg px-3 py-1.5"
                                        >
                                          {opt}
                                        </li>
                                      ))}
                                    </ol>
                                  ) : null}

                                  {/* Difficulty badges */}
                                  <div className="flex gap-2 mt-1 no-print">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider
                                      ${q.difficulty === "easy" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                        q.difficulty === "medium" ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                          "bg-rose-50 text-rose-600 border border-rose-100"
                                      }
                                    `}>
                                      {labelDifficulty(q.difficulty)}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/50 uppercase tracking-wider">
                                      {labelForType(q.type)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <span className="font-extrabold text-slate-500 shrink-0 text-right whitespace-nowrap">
                                [{q.marks} Mark{q.marks > 1 ? "s" : ""}]
                              </span>
                            </div>
                          ))}
                        </div>

                      </div>
                    ))}

                    {/* End of Question paper banner */}
                    <div className="text-center text-slate-400 font-bold text-[11px] uppercase tracking-widest my-8 break-inside-avoid">
                      ✦ End of Question Paper ✦
                    </div>

                  </div>
                </>
              ) : null}

            </div>
          ) : isCreateMode ? (
            /* WIZARD FORM: CREATE ASSIGNMENT SCREEN */
            <div className="w-full h-full flex flex-col justify-between relative px-1 py-1 animate-[fade-in_0.4s_ease] select-none">

              {/* Mobile Title Header */}
              <div className="flex items-center w-full relative mb-5 mt-2 md:hidden">
                <button
                  className="w-9 h-9 rounded-full bg-slate-200/50 flex items-center justify-center hover:bg-slate-200 transition-all border-none cursor-pointer absolute left-0 shadow-sm"
                  aria-label="Go back"
                  onClick={() => setIsCreateMode(false)}
                >
                  <ArrowLeft size={16} className="text-slate-800" strokeWidth={2.5} />
                </button>
                <h2 className="text-[17px] font-bold text-slate-800 mx-auto tracking-tight">Assignment</h2>
              </div>

              {/* Desktop/Tablet Title Header */}
              <div className="hidden md:flex flex-col gap-1 mb-5 pl-0.5">
                <h2 className="text-xl md:text-[23px] font-extrabold text-slate-800 flex items-center gap-2.5 tracking-tight">
                  <span className="w-[13px] h-[13px] bg-emerald-500 rounded-full inline-block shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
                  Create Assignment
                </h2>
                <p className="text-[13.5px] text-[#A0AEC0] font-medium">Set up a new assignment for your students</p>
              </div>

              {/* Progress Step Bar */}
              <div className="flex justify-center items-center gap-3 w-full max-w-[650px] mx-auto mb-6 px-4">
                <div className="h-[3.5px] w-1/2 bg-slate-800 rounded-full shadow-sm"></div>
                <div className="h-[3.5px] w-1/2 bg-slate-200/80 rounded-full"></div>
              </div>

              {/* Large Wizard Card */}
              <form onSubmit={handleCreateAssignmentWizard} className="bg-white rounded-[24px] md:rounded-[28px] p-6 md:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.02)] border border-slate-100/80 flex flex-col gap-6 w-full max-w-[760px] mx-auto mb-6">

                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[17px] font-bold text-slate-800 tracking-tight">Assignment Details</h3>
                  <p className="text-[13px] text-[#A0AEC0] font-medium">Basic information about your assignment</p>
                </div>

                {/* Form Field Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-bold text-slate-700">Assignment Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Mid-Term Science Assessment"
                      className="w-full bg-[#FAFBFB] focus:bg-white border border-slate-200 focus:border-slate-400 rounded-xl py-3 px-4 text-[13px] text-slate-800 placeholder-slate-400 outline-none transition-all duration-200 font-medium"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-bold text-slate-700">Subject</label>
                    <input
                      type="text"
                      placeholder="e.g. Chemistry"
                      className="w-full bg-[#FAFBFB] focus:bg-white border border-slate-200 focus:border-slate-400 rounded-xl py-3 px-4 text-[13px] text-slate-800 placeholder-slate-400 outline-none transition-all duration-200 font-medium"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-bold text-slate-700">Target Class / Group</label>
                    <select
                      className="w-full bg-[#FAFBFB] focus:bg-white border border-slate-200 focus:border-slate-400 rounded-xl py-3 px-4 text-[13px] text-slate-800 outline-none cursor-pointer transition-all duration-200 font-bold"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    >
                      <option value="Class 10 - A">Class 10 - A</option>
                      <option value="Class 10 - B">Class 10 - B</option>
                      <option value="Class 11 - Science">Class 11 - Science</option>
                      <option value="Class 12 - Commerce">Class 12 - Commerce</option>
                      <option value="AI Explorers Club">AI Explorers Club</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[13px] font-bold text-slate-700">Due Date</label>
                    <div className="relative flex items-center w-full">
                      <input
                        type="date"
                        className="w-full bg-[#FAFBFB] focus:bg-white border border-slate-200 focus:border-slate-400 rounded-xl py-3 px-4 text-[13px] text-slate-800 placeholder-slate-400 outline-none transition-all duration-200 font-medium"
                        value={dueDate}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={(e) => setDueDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* 2. File Upload Box */}
                <div className="flex flex-col gap-3">
                  <div className="w-full border-2 border-dashed border-slate-200 rounded-[20px] p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 hover:bg-slate-50 transition-all relative">
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,text/plain,application/pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadedFile(e.target.files[0]);
                          setUploadedFileName(e.target.files[0].name);
                        }
                      }}
                    />
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.03)] border border-slate-100 mb-3">
                      <FileUp className="w-5 h-5 text-slate-500" />
                    </div>
                    {uploadedFileName ? (
                      <p className="font-extrabold text-[13.5px] text-emerald-600 mb-0.5">Selected: {uploadedFileName}</p>
                    ) : (
                      <p className="font-extrabold text-[13.5px] text-slate-700 mb-0.5">Choose a file or drag & drop it here</p>
                    )}
                    <p className="text-[11px] text-slate-400 font-medium mb-3.5">PDF or TXT context material, upto 10MB</p>

                    <button type="button" className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-[12px] py-2 px-5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-slate-200/80 cursor-pointer transition-all border-solid pointer-events-none">
                      Browse Files
                    </button>
                  </div>
                  <p className="text-[11.5px] text-slate-400 text-center font-medium">Upload images or reference textbook chapters</p>
                </div>

                {/* 4. Question Configuration Table */}
                <div className="flex flex-col gap-4 mt-2">
                  <div className="hidden md:flex items-center justify-between text-[11.5px] font-bold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100/80">
                    <div className="w-[50%]">Question Type</div>
                    <div className="w-[25%] text-center">No. of Questions</div>
                    <div className="w-[20%] text-center">Marks</div>
                  </div>

                  {/* Table Rows (Desktop) */}
                  <div className="hidden md:flex flex-col gap-3.5">
                    {questionRows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-3 animate-[scale-up_0.15s_ease-out]">

                        {/* Selector dropdown */}
                        <div className="w-[50%] relative">
                          <select
                            className="w-full bg-[#FAFBFB] border border-slate-200 rounded-xl py-2.5 px-3 pr-8 text-[13px] font-bold text-slate-700 outline-none appearance-none cursor-pointer hover:bg-slate-50 transition-all"
                            value={row.type}
                            onChange={(e) => handleRowTypeChange(row.id, e.target.value as QuestionType)}
                          >
                            <option value="multiple-choice">Multiple Choice Questions</option>
                            <option value="short-answer">Short Questions</option>
                            <option value="long-answer">Long Answer Questions</option>
                            <option value="case-study">Case Study Problems</option>
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center">
                            <ChevronDown size={14} />
                          </div>
                        </div>

                        {/* Delete Row */}
                        <button
                          type="button"
                          className="bg-none border-none text-slate-400 hover:text-red-500 cursor-pointer p-1 rounded-full flex items-center justify-center transition-all"
                          onClick={() => handleRowDelete(row.id)}
                        >
                          <X size={14} strokeWidth={2.5} />
                        </button>

                        {/* Questions Counter */}
                        <div className="w-[25%] flex items-center justify-between bg-slate-50 border border-slate-200/50 rounded-full px-2 py-1 max-w-[85px] mx-auto shadow-sm">
                          <button
                            type="button"
                            className="bg-none border-none text-slate-400 hover:text-slate-800 font-extrabold cursor-pointer text-[14px] px-1"
                            onClick={() => handleCountChange(row.id, -1)}
                          >
                            -
                          </button>
                          <span className="text-[12.5px] font-extrabold text-slate-700">{row.count}</span>
                          <button
                            type="button"
                            className="bg-none border-none text-slate-400 hover:text-slate-800 font-extrabold cursor-pointer text-[13px] px-1"
                            onClick={() => handleCountChange(row.id, 1)}
                          >
                            +
                          </button>
                        </div>

                        {/* Marks Counter */}
                        <div className="w-[20%] flex items-center justify-between bg-slate-50 border border-slate-200/50 rounded-full px-2 py-1 max-w-[75px] mx-auto shadow-sm">
                          <button
                            type="button"
                            className="bg-none border-none text-slate-400 hover:text-slate-800 font-extrabold cursor-pointer text-[14px] px-1"
                            onClick={() => handleMarksChange(row.id, -1)}
                          >
                            -
                          </button>
                          <span className="text-[12.5px] font-extrabold text-slate-700">{row.marks}</span>
                          <button
                            type="button"
                            className="bg-none border-none text-slate-400 hover:text-slate-800 font-extrabold cursor-pointer text-[13px] px-1"
                            onClick={() => handleMarksChange(row.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mobile Stack layout */}
                  <div className="flex md:hidden flex-col gap-4">
                    {questionRows.map((row) => (
                      <div key={row.id} className="bg-white border border-slate-100 rounded-[20px] p-4.5 shadow-[0_4px_20px_rgba(0,0,0,0.015)] flex flex-col gap-3.5 relative animate-[scale-up_0.15s_ease-out]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="relative flex-grow max-w-[85%]">
                            <select
                              className="w-full bg-transparent border-none text-[13.5px] font-bold text-slate-800 outline-none appearance-none cursor-pointer pr-6"
                              value={row.type}
                              onChange={(e) => handleRowTypeChange(row.id, e.target.value as QuestionType)}
                            >
                              <option value="multiple-choice">Multiple Choice Questions</option>
                              <option value="short-answer">Short Questions</option>
                              <option value="long-answer">Long Answer Questions</option>
                              <option value="case-study">Case Study Problems</option>
                            </select>
                            <div className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center">
                              <ChevronDown size={14} />
                            </div>
                          </div>
                          <button
                            type="button"
                            className="bg-none border-none text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                            onClick={() => handleRowDelete(row.id)}
                          >
                            <X size={15} strokeWidth={2.5} />
                          </button>
                        </div>

                        <div className="bg-[#FAFBFB] rounded-xl p-3 flex items-center justify-between gap-4">
                          <div className="flex flex-col gap-1 items-center flex-1">
                            <span className="text-[11px] font-bold text-slate-400">No. of Questions</span>
                            <div className="flex items-center justify-between w-full max-w-[95px] bg-white border border-slate-100 rounded-full px-2 py-1 shadow-sm mt-1">
                              <button
                                type="button"
                                className="bg-none border-none text-slate-400 hover:text-slate-800 cursor-pointer text-[14px] px-1"
                                onClick={() => handleCountChange(row.id, -1)}
                              >
                                -
                              </button>
                              <span className="text-[12px] font-extrabold text-slate-800">{row.count}</span>
                              <button
                                type="button"
                                className="bg-none border-none text-slate-400 hover:text-slate-800 cursor-pointer text-[13px] px-1"
                                onClick={() => handleCountChange(row.id, 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="w-[1px] h-9 bg-slate-200/60 shrink-0"></div>

                          <div className="flex flex-col gap-1 items-center flex-1">
                            <span className="text-[11px] font-bold text-slate-400">Marks</span>
                            <div className="flex items-center justify-between w-full max-w-[95px] bg-white border border-slate-100 rounded-full px-2 py-1 shadow-sm mt-1">
                              <button
                                type="button"
                                className="bg-none border-none text-slate-400 hover:text-slate-800 cursor-pointer text-[14px] px-1"
                                onClick={() => handleMarksChange(row.id, -1)}
                              >
                                -
                              </button>
                              <span className="text-[12px] font-extrabold text-slate-800">{row.marks}</span>
                              <button
                                type="button"
                                className="bg-none border-none text-slate-400 hover:text-slate-800 cursor-pointer text-[13px] px-1"
                                onClick={() => handleMarksChange(row.id, 1)}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Row and Totals */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-3 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      className="flex items-center gap-2 bg-none border-none text-slate-800 hover:text-slate-900 font-extrabold text-[13px] cursor-pointer"
                      onClick={handleAddRow}
                    >
                      <span className="w-5.5 h-5.5 rounded-full bg-slate-800 flex items-center justify-center text-white text-[14px] font-extrabold">+</span>
                      <span>Add Question Type</span>
                    </button>

                    <div className="flex flex-col gap-1 items-end text-right pr-2">
                      <span className="text-[12.5px] font-bold text-slate-500">
                        Total Questions: <span className="text-slate-800 font-extrabold">{questionRows.reduce((sum, r) => sum + r.count, 0)}</span>
                      </span>
                      <span className="text-[12.5px] font-bold text-slate-500">
                        Total Marks: <span className="text-slate-800 font-extrabold">{questionRows.reduce((sum, r) => sum + (r.count * r.marks), 0)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Additional Instructions */}
                <div className="flex flex-col gap-2 mt-1">
                  <label className="text-[13.5px] font-bold text-slate-700">Additional Instructions (For tailored questions)</label>
                  <div className="w-full border border-dashed border-slate-200 rounded-[20px] p-4 flex flex-col justify-between bg-[#FAFBFB] relative min-h-[110px]">
                    <textarea
                      placeholder="e.g Focus heavily on laws of thermodynamics, avoid direct recall questions, make it application-based..."
                      className="w-full bg-transparent border-none outline-none resize-none text-[12.5px] text-slate-700 placeholder-slate-400 pr-8 font-medium"
                      rows={3}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  </div>
                </div>

              </form>

              {/* Wizard Form Controls */}
              <div className="flex items-center justify-between w-full max-w-[760px] mx-auto mt-2 mb-4 shrink-0 px-2">
                <button
                  type="button"
                  className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-full py-2.5 px-6 text-[13px] font-extrabold cursor-pointer shadow-sm transition-all border-solid"
                  onClick={() => setIsCreateMode(false)}
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                  </svg>
                  <span>Cancel</span>
                </button>

                <button
                  type="button"
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white border-none rounded-full py-2.5 px-6 text-[13px] font-extrabold cursor-pointer shadow-md transition-all disabled:opacity-50"
                  disabled={submitting}
                  onClick={handleCreateAssignmentWizard}
                >
                  <span>{submitting ? "Queuing..." : "Generate paper"}</span>
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>

            </div>
          ) : (
            /* HOME STATE DASHBOARD (REPLICATES FIGMA MOCKUP 1 AND FIGMA DESIGNS) */
            <>
              {assignments.length === 0 ? (
                /* EMPTY STATE */
                <div className="flex flex-col items-center justify-center m-auto text-center max-w-[520px] p-5 animate-[fade-in_0.4s_ease]">
                  <div className="relative w-[240px] md:w-[280px] h-[200px] md:h-[240px] flex items-center justify-center mb-5">
                    <img
                      src="/illustrations/Illustrationfound.png"
                      alt="No assignments yet"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <h2 className="text-xl md:text-22 font-bold text-slate-800 mb-2 md:mb-3 tracking-tight">No assignments yet</h2>
                  <p className="text-[13.5px] md:text-[14.5px] leading-relaxed text-slate-500 mb-6 md:mb-7 max-w-[440px]">
                    Create your first assignment to start collecting and grading student submissions. You can set up rubrics, define marking criteria, and let AI assist with grading.
                  </p>
                  <button
                    className="flex items-center gap-2 bg-[#1E293B] hover:bg-[#0F172A] text-white border-none rounded-full py-3 px-7 text-[14.5px] font-semibold cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300"
                    onClick={() => setIsCreateMode(true)}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                    <span>Create Your First Assignment</span>
                  </button>
                </div>
              ) : (
                /* FILLED ASSIGNMENT CARDS VIEW */
                <div className="w-full animate-[fade-in_0.4s_ease]">

                  {/* Title Headers */}
                  <div className="hidden md:flex flex-col gap-1.5 mb-5 md:mb-6 animate-[slide-down_0.4s_ease] pl-0.5 mt-1.5">
                    <h2 className="text-xl md:text-[23px] font-extrabold text-slate-800 flex items-center gap-2.5 tracking-tight">
                      <span className="w-[13px] h-[13px] bg-emerald-500 rounded-full inline-block shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
                      Assignments
                    </h2>
                    <p className="text-[13.5px] text-[#A0AEC0] font-medium">Manage and create assessments for your classes.</p>
                  </div>

                  <div className="flex items-center w-full relative mb-5 mt-2 md:hidden">
                    <button
                      className="w-9 h-9 rounded-full bg-slate-200/50 flex items-center justify-center hover:bg-slate-200 transition-all border-none cursor-pointer absolute left-0 shadow-sm"
                      aria-label="Go back"
                      onClick={() => setIsCreateMode(false)}
                    >
                      <ArrowLeft size={16} className="text-slate-800" strokeWidth={2.5} />
                    </button>
                    <h2 className="text-[17px] font-bold text-slate-800 mx-auto tracking-tight">Assignments</h2>
                  </div>

                  {/* Filter and Search Bar */}
                  <div className="flex items-center justify-between bg-white rounded-[16px] md:rounded-[18px] p-2.5 md:p-3 shadow-[0_2px_12px_rgba(0,0,0,0.01)] border border-slate-100 mb-5 relative z-30">
                    <div className="relative">
                      <button
                        className="flex items-center gap-1.5 md:gap-2 bg-none border-none text-[#A0AEC0] hover:text-slate-800 text-[13.5px] md:text-[14px] font-bold transition-all duration-200 cursor-pointer p-1 rounded-lg"
                        onClick={(e) => { e.stopPropagation(); setIsFilterDropdownOpen(!isFilterDropdownOpen); }}
                      >
                        <Filter size={15} className="text-slate-400" />
                        <span className="md:inline hidden">Filter By</span>
                        <span className="md:hidden inline text-[#8E8E93] font-medium">Filter</span>
                      </button>

                      {isFilterDropdownOpen && (
                        <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-lg p-1.5 z-40 animate-[scale-up_0.2s_ease-out]">
                          <button
                            type="button"
                            className={`w-full text-left py-2 px-3 text-[13px] font-medium rounded-lg hover:bg-[#F3F3F3] transition-all ${filterGroup === "All" ? "bg-[#ECECEC] text-slate-800" : "text-slate-600"}`}
                            onClick={() => { setFilterGroup("All"); setIsFilterDropdownOpen(false); }}
                          >
                            All Classes
                          </button>
                          <button
                            type="button"
                            className={`w-full text-left py-2 px-3 text-[13px] font-medium rounded-lg hover:bg-[#F3F3F3] transition-all ${filterGroup === "Class 10 - A" ? "bg-[#ECECEC] text-slate-800" : "text-slate-600"}`}
                            onClick={() => { setFilterGroup("Class 10 - A"); setIsFilterDropdownOpen(false); }}
                          >
                            Class 10 - A
                          </button>
                          <button
                            type="button"
                            className={`w-full text-left py-2 px-3 text-[13px] font-medium rounded-lg hover:bg-[#F3F3F3] transition-all ${filterGroup === "Class 11 - Science" ? "bg-[#ECECEC] text-slate-800" : "text-slate-600"}`}
                            onClick={() => { setFilterGroup("Class 11 - Science"); setIsFilterDropdownOpen(false); }}
                          >
                            Class 11 - Science
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Search Field */}
                    <div className="relative flex items-center w-[60%] sm:w-64 md:w-80">
                      <Search className="absolute left-3.5 text-slate-400 w-3.5 h-3.5 md:w-4 md:h-4 pointer-events-none" />
                      <input
                        type="text"
                        className="w-full border border-slate-200 focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,94,58,0.15)] rounded-full py-1.5 md:py-2 pl-9 md:pl-11 pr-4 text-[13px] md:text-[13.5px] text-slate-800 placeholder-slate-400 outline-none bg-white transition-all duration-200"
                        placeholder="Search Name"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button className="absolute right-3.5 text-slate-400 hover:text-slate-800" onClick={() => setSearchQuery("")}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Grid of Dynamic Cards */}
                  {filteredAssignments.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl shadow-sm border border-slate-100">
                      <BookOpen className="mx-auto text-slate-300 mb-3" size={32} />
                      <p className="text-slate-500 font-semibold text-[14px]">No assignments match your search query.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 w-full animate-fade-in">
                      {filteredAssignments.map((item) => (
                        <div
                          key={item._id}
                          className="bg-white rounded-[20px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.015)] border border-slate-100/80 hover:shadow-premium hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between gap-5 relative group cursor-pointer"
                          onClick={() => { setSelectedId(item._id); }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setContextMenu({
                              visible: true,
                              x: e.clientX,
                              y: e.clientY,
                              assignmentId: item._id
                            });
                          }}
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex flex-col gap-1.5">
                              <h3 className="text-[17.5px] font-bold text-[#1F2937] leading-snug tracking-tight">
                                <span className="underline decoration-[#1F2937] decoration-[1.5px] underline-offset-[5px] mr-1.5">
                                  {item.title.split(" ")[0]}
                                </span>
                                {item.title.split(" ").slice(1).join(" ")}
                              </h3>
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-slate-400 bg-slate-100 w-fit">
                                {item.subject} | {item.grade}
                              </span>
                            </div>

                            {/* Three dots action */}
                            <button
                              className="bg-none border-none text-[#CBD5E1] hover:text-slate-600 rounded-full p-1 flex items-center justify-center transition-all duration-200 cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setContextMenu({
                                  visible: true,
                                  x: rect.left - 130,
                                  y: rect.bottom + 8,
                                  assignmentId: item._id
                                });
                              }}
                            >
                              <MoreVertical size={20} />
                            </button>
                          </div>

                          <p className="text-[12.8px] leading-relaxed text-[#A0AEC0] line-clamp-2 pr-2 font-medium">
                            {item.instructions || "Auto-generated structured question paper with balanced difficulty grades."}
                          </p>

                          {/* Footer */}
                          <div className="flex justify-between items-center text-[13px] border-t border-slate-100/80 pt-4 mt-1">
                            <span className="text-[#A0AEC0] font-medium">
                              Status: <span className={`font-bold capitalize 
                                ${item.status === "completed" ? "text-emerald-600" :
                                  item.status === "failed" ? "text-red-500" :
                                    "text-amber-500 animate-pulse"
                                }
                              `}>
                                {item.status}
                              </span>
                            </span>

                            <span className="text-[#1F2937] font-extrabold tracking-tight">
                              Due: <span className="text-[#1F2937] font-extrabold">{formatDate(item.dueDate)}</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </>
          )}

        </section>

        {/* Dynamic Static Fade */}
        {!isCreateMode && !selectedId && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#F1F3F5] via-[#F1F3F5]/90 to-transparent pointer-events-none z-10 rounded-b-[20px]"></div>
        )}

        {/* Floating Creation Button */}
        {assignments.length > 0 && !isCreateMode && !selectedId && (
          <button
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.25)] bg-[#1E293B] hover:bg-[#0F172A] text-white px-6 py-3.5 rounded-full flex items-center gap-2 font-bold transition-all duration-200 cursor-pointer border-none text-[13.5px] whitespace-nowrap"
            onClick={() => { setIsCreateMode(true); setSelectedId(null); setActiveTab("Assignments"); }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Create Assignment</span>
          </button>
        )}

      </main>

      {/* CUSTOM CONTEXT MENU PORTAL */}
      {contextMenu.visible && contextMenu.assignmentId && (
        <div
          className="fixed bg-white border border-slate-100/80 rounded-[16px] shadow-[0_12px_32px_rgba(0,0,0,0.08)] py-1.5 px-1.5 z-[1000] w-44 animate-[scale-up_0.15s_ease-out] select-none"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left py-2 px-3 text-[13.5px] font-bold text-slate-700 hover:bg-[#F3F4F6] rounded-xl transition-all cursor-pointer mb-1 block border-none bg-none"
            onClick={() => {
              if (contextMenu.assignmentId) setSelectedId(contextMenu.assignmentId);
              setContextMenu({ visible: false, x: 0, y: 0, assignmentId: null });
            }}
          >
            View Assignment
          </button>
          <button
            type="button"
            className="w-full text-left py-2 px-3 text-[13.5px] font-bold text-red-600 bg-red-50/70 hover:bg-red-100 rounded-xl transition-all cursor-pointer block border-none"
            onClick={() => {
              const item = assignments.find((a) => a._id === contextMenu.assignmentId);
              if (item) void handleDeleteAssignment(item._id, item.title);
            }}
          >
            Delete
          </button>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-5 left-5 right-5 h-[68px] bg-[#1E1E1E] rounded-[20px] flex items-center justify-around px-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.3),_inset_0_1px_0_rgba(255,255,255,0.05)] z-[100]">
        <a
          href="#home"
          className={`flex flex-col items-center justify-center gap-1 text-[#8E8E93] text-[11px] font-semibold cursor-pointer hover:text-slate-300 transition-all duration-200 flex-1 h-full ${activeTab === "Home" ? "text-white" : ""}`}
          onClick={() => { setActiveTab("Home"); setIsCreateMode(false); setSelectedId(null); }}
        >
          <LayoutGrid className="w-5 h-5" />
          <span>Home</span>
        </a>
        <a
          href="#assignments"
          className={`flex flex-col items-center justify-center gap-1 text-[#8E8E93] text-[11px] font-semibold cursor-pointer hover:text-slate-300 transition-all duration-200 flex-1 h-full ${activeTab === "Assignments" || activeTab === "My Groups" ? "text-white" : ""}`}
          onClick={() => { setActiveTab("Assignments"); setIsCreateMode(false); setSelectedId(null); }}
        >
          <Users className={`w-5 h-5 transition-transform duration-200 ${activeTab === "Assignments" || activeTab === "My Groups" ? "-translate-y-0.5" : ""}`} />
          <span>Groups</span>
        </a>
        <a
          href="#library"
          className={`flex flex-col items-center justify-center gap-1 text-[#8E8E93] text-[11px] font-semibold cursor-pointer hover:text-slate-300 transition-all duration-200 flex-1 h-full ${activeTab === "My Library" ? "text-white" : ""}`}
          onClick={() => { setActiveTab("My Library"); setIsCreateMode(false); setSelectedId(null); }}
        >
          <BookOpen className="w-5 h-5" />
          <span>Library</span>
        </a>
        <a
          href="#toolkit"
          className={`flex flex-col items-center justify-center gap-1 text-[#8E8E93] text-[11px] font-semibold cursor-pointer hover:text-slate-300 transition-all duration-200 flex-1 h-full ${activeTab === "AI Toolkit" ? "text-white" : ""}`}
          onClick={() => { setActiveTab("AI Toolkit"); setIsCreateMode(false); setSelectedId(null); }}
        >
          <Wand2 className="w-5 h-5" />
          <span>Toolkit</span>
        </a>
      </nav>

      {/* MOBILE DRAWER */}
      <div
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-[4px] z-[500] transition-all duration-300 ${isMobileDrawerOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
        onClick={() => setIsMobileDrawerOpen(false)}
      >
        <div
          className={`fixed top-0 right-0 w-[280px] h-screen bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.1)] z-[501] flex flex-col p-6 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isMobileDrawerOpen ? "translate-x-0" : "translate-x-full"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
            <span className="text-[18px] font-extrabold text-slate-800">Navigation</span>
            <button className="bg-none border-none cursor-pointer text-slate-400 hover:text-slate-800 p-1 flex items-center justify-center rounded-full" onClick={() => setIsMobileDrawerOpen(false)}>
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-2 flex-grow">
            <div className="flex items-center gap-2.5 pl-1.5 mb-6">
              <div className="w-10 h-10 rounded-[12px] overflow-hidden flex items-center justify-center shadow-[0_4px_12px_rgba(255,94,58,0.25)] shrink-0">
                <img
                  src="/avatars/school.png"
                  alt="VedaAI logo"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              </div>
              <h1 className="text-[22px] font-extrabold text-[#1F2937] tracking-tight leading-none">VedaAI</h1>
            </div>

            <li className="list-none w-full">
              <a
                href="#home"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-600 text-[14px] font-medium hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "Home" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("Home"); setIsMobileDrawerOpen(false); setSelectedId(null); }}
              >
                <HomeIcon className="w-4 h-4 opacity-85" />
                <span>Home Dashboard</span>
              </a>
            </li>
            <li className="list-none w-full">
              <a
                href="#groups"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-600 text-[14px] font-medium hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "My Groups" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("My Groups"); setIsMobileDrawerOpen(false); setSelectedId(null); }}
              >
                <Users className="w-4 h-4 opacity-85" />
                <span>My Groups</span>
              </a>
            </li>
            <li className="list-none w-full">
              <a
                href="#assignments"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-660 text-[14px] font-medium hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "Assignments" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("Assignments"); setIsMobileDrawerOpen(false); setSelectedId(null); }}
              >
                <ClipboardList className="w-4 h-4 opacity-85" />
                <span>Assignments List</span>
                {assignments.length > 0 && (
                  <span className="bg-[#FF5E3A] text-white text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto min-w-[20px] text-center shadow-sm">
                    {assignments.length}
                  </span>
                )}
              </a>
            </li>
            <li className="list-none w-full">
              <a
                href="#toolkit"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-600 text-[14px] font-medium hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "AI Toolkit" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("AI Toolkit"); setIsMobileDrawerOpen(false); setSelectedId(null); }}
              >
                <Wand2 className="w-4 h-4 opacity-85" />
                <span>AI Teacher&apos;s Toolkit</span>
              </a>
            </li>
            <li className="list-none w-full">
              <a
                href="#library"
                className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-600 text-[14px] font-medium hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "My Library" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
                onClick={() => { setActiveTab("My Library"); setIsMobileDrawerOpen(false); setSelectedId(null); }}
              >
                <Library className="w-4 h-4 opacity-85" />
                <span>My Library</span>
              </a>
            </li>
          </div>

          <div className="mt-auto border-t border-slate-100 pt-4 flex flex-col gap-3">
            <a
              href="#settings"
              className={`flex items-center gap-3 py-2.5 px-4 rounded-xl text-slate-600 text-[14px] font-medium hover:bg-[#F3F3F3] hover:text-slate-800 transition-all duration-200 cursor-pointer ${activeTab === "Settings" ? "bg-[#ECECEC] text-slate-800 font-bold" : ""}`}
              onClick={() => { setActiveTab("Settings"); setIsMobileDrawerOpen(false); }}
            >
              <Settings className="w-4 h-4 opacity-85" />
              <span>Settings</span>
            </a>

            <div className="flex items-center gap-3 bg-bgHover rounded-[18px] p-3 mt-1 cursor-pointer">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-rose-100 flex items-center justify-center shrink-0 shadow-sm">
                <img
                  src="/avatars/school.png"
                  alt="Delhi Public School logo"
                  className="w-full h-full object-cover"
                  width={40}
                  height={40}
                />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-[13px] text-slate-800 truncate">Delhi Public School</span>
                <span className="text-[11px] text-slate-500 truncate">Bokaro Steel City</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TOAST ALERTS */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[2000] flex flex-col gap-2">
          <div className="bg-slate-800 text-white rounded-xl py-3 px-4.5 flex items-center gap-2.5 shadow-lg text-[13.5px] font-semibold animate-[slide-in-toast_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <CheckCircle className="text-emerald-500" size={16} />
            <span>{toast}</span>
          </div>
        </div>
      )}

    </div>
  );
}
