import type { Difficulty } from "@/lib/types";

interface DifficultyBadgeProps {
  value: Difficulty;
}

export function DifficultyBadge({ value }: DifficultyBadgeProps) {
  const label = value === "medium" ? "Moderate" : value.charAt(0).toUpperCase() + value.slice(1);

  return <span className={`difficulty-badge difficulty-${value}`}>{label}</span>;
}
