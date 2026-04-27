const { z } = require("zod");

const TeamSizeSchema = z.number().int().min(3).max(8);
const StrategySchema = z.enum(["conservative", "experimental", "chaotic"]);

const RoleSchema = z.enum(["dev", "design", "data", "pm", "biz"]);

const TuningSchema = z
  .object({
    stability: z.number().min(0).max(1).default(0.5),
    novelty: z.number().min(0).max(1).default(0.7),
    balance: z.number().min(0).max(1).default(0.6),
    bridges: z.number().int().min(1).max(2).nullable().default(null),
  })
  .partial();

module.exports = { TeamSizeSchema, StrategySchema, RoleSchema, TuningSchema };

