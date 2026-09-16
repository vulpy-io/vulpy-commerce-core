import type { MedusaContainer } from "@medusajs/framework/types";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  type BestsellerRankingsResult,
  calculateBestsellerRankings,
} from "../modules/bestseller/calculate-rankings";

const updateBestsellerRankingsStep = createStep(
  "update-bestseller-rankings",
  async (_input: Record<string, never>, { container }) => {
    const result = await calculateBestsellerRankings(container);
    return new StepResponse<BestsellerRankingsResult>(result);
  }
);

export const updateBestsellerRankingsWorkflow = createWorkflow(
  "update-bestseller-rankings",
  (input: Record<string, never>) => {
    const result = updateBestsellerRankingsStep(input);
    return new WorkflowResponse(result);
  }
);

export async function runUpdateBestsellerRankingsWorkflow(
  container: MedusaContainer
) {
  const { result } = await updateBestsellerRankingsWorkflow(container).run({
    input: {},
  });

  return result;
}
