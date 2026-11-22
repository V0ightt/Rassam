import type { BenchCase } from "../types";
import { architectureCases } from "./architecture";
import { checkTamperingCases } from "./check-tampering";
import { contractTamperingCases } from "./contract-tampering";
import { negativeCases } from "./negatives";
import { reachCases } from "./reach";

export const ALL_CASES: BenchCase[] = [
  ...checkTamperingCases,
  ...contractTamperingCases,
  ...architectureCases,
  ...reachCases,
  ...negativeCases,
];
