import { z } from "zod";

export const AgentReportSchema = z.object({
  agentName: z.enum(["Balancer", "Explorer", "Wildcard", "Manual"]),
  contributedPosts: z.array(z.string()),
  executedQueries: z.string(),
  log: z.string(),
});

export const SwarmJobResultSchema = z.object({
  finalPosts: z.array(z.string()),
  triggerSuggestions: z.array(z.string()),
  agentReports: z.array(AgentReportSchema),
});

export const AnnotationSchema = z.object({
  labels: z.array(z.number().min(0).max(1)).length(5),
  tactics: z.array(z.string()),
  emotion_fuel: z.string(),
  stance_label: z.enum(["AGAINST", "FOR", "NEUTRAL"]),
  stance_target: z.string(),
});

export const UiSuggestionSchema = z.discriminatedUnion("control_type", [
  z.object({
    field_path: z.string(),
    control_type: z.literal("slider"),
    rationale: z.string(),
    suggestion: z.number(),
  }),
  z.object({
    field_path: z.string(),
    control_type: z.literal("multiselect"),
    rationale: z.string(),
    suggestion: z.array(z.string()),
  }),
  z.object({
    field_path: z.string(),
    control_type: z.literal("select"),
    rationale: z.string(),
    suggestion: z.string(),
  }),
  z.object({
    field_path: z.string(),
    control_type: z.literal("text"),
    rationale: z.string(),
    suggestion: z.string(),
  }),
]);

export const QcAgentResultSchema = z.object({
  qc_passed: z.boolean(),
  feedback: z.string(),
  ui_suggestions: z.array(UiSuggestionSchema),
});

export const KnowledgeGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.object({ label: z.string() }),
      style: z.record(z.string(), z.any()).optional(),
    })
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      animated: z.boolean().optional(),
      style: z.record(z.string(), z.any()).optional(),
    })
  ),
});