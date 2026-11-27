import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { Env, JobParams } from "./bindings";
import { prefix } from "./bindings";
import { commit, jobRow, record } from "./jobs";
import { approvedArtworkPrompt, generatePanel, identifyPanels, openAI, ProductionError, runtimeManifest, startVectorization,
  uploadMaster, uploadRuntimePart, vectorStatus } from "./openai";
import { getValidation, packageOutput, validatePanel } from "./reports";

const noRepeat = { retries: { limit: 0, delay: "1 second" as const }, timeout: "9 minutes" as const };
const recover = { retries: { limit: 2, delay: "5 seconds" as const, backoff: "exponential" as const }, timeout: "2 minutes" as const };

export class JerseyProduction extends WorkflowEntrypoint<Env, JobParams> {
  async run(event: WorkflowEvent<JobParams>, step: WorkflowStep) {
    const id = event.payload.id;
    const env = this.env;
    let position = 1;

    const start = async (stage: number, text: string) => {
      position = stage;
      await step.do("start-" + stage, recover, () => record(env, id, stage, "running", text));
    };
    const done = (stage: number, text: string) =>
      step.do("finish-" + stage, recover, () => record(env, id, stage, "complete", text));

    try {
      const row = await step.do("load-job", recover, async () => {
        const stored = await jobRow(env, id);
        if (!stored || stored.status === "complete" || stored.status === "failed") throw new ProductionError("The production job is unavailable.");
        return stored;
      });
      const source = prefix(id) + "reference";
      await start(1, "Checking the uploaded image and production connection.");
      const manifest = await step.do("source-preflight", recover, async () => {
        const object = await env.BUCKET.head(source);
        if (!env.OPENAI_API_KEY?.trim()) throw new ProductionError("Production connection pending.");
        if (!object || object.customMetadata?.sha256 !== row.source_hash) throw new ProductionError("The reference image could not be verified.");
        await approvedArtworkPrompt(env);
        return runtimeManifest(env);
      });
      await done(1, "Verified the uploaded reference and production configuration.");

      await start(2, "Identifying the jersey body panels in the reference.");
      const observed = await step.do("identify-panels", noRepeat, () => identifyPanels(env, row, source));
      const caption = observed.front && observed.back ? "Identified the front and back body panels."
        : observed.front ? "Identified the front panel. The back will follow the visible design language."
        : "Identified the back panel. The front will follow the visible design language.";
      await done(2, caption);

      await start(3, "Generating flat body artwork from the reference.");
      const frontHash = await step.do("create-front-master", noRepeat, () => generatePanel(env, row, "front", source));
      await step.do("publish-front-master", recover, async () => { await env.DB.prepare("UPDATE jobs SET front_ready = 1, updated_at = ? WHERE id = ?").bind(Date.now(), id).run(); });
      const backHash = await step.do("create-back-master", noRepeat, () => generatePanel(env, row, "back", source));
      await step.do("publish-back-master", recover, async () => { await env.DB.prepare("UPDATE jobs SET back_ready = 1, updated_at = ? WHERE id = ?").bind(Date.now(), id).run(); });
      await done(3, "Locked the native 2K front and back artwork masters.");

      await start(4, "Tracing native vector contours from the locked artwork.");
      const files: string[] = [];
      for (const part of manifest) {
        files.push(await step.do("runtime-" + part.name, recover, () => uploadRuntimePart(env, part)));
      }
      const front = await step.do("mount-front-master", recover, () => uploadMaster(env, id, "front"));
      const back = await step.do("mount-back-master", recover, () => uploadMaster(env, id, "back"));
      const responseId = await step.do("start-hosted-vectorization", noRepeat, () => startVectorization(env, row.mode, [...files, front, back]));
      let container: string | null = null;
      let proofStarted = false;
      for (let index = 0; index < 144; index++) {
        const status = await step.do("provider-status-" + index, recover, () => vectorStatus(env, responseId));
        if (status.container) container = status.container;
        if (["failed", "incomplete", "cancelled"].includes(status.status)) throw new ProductionError("The hosted vectorization ended before it produced verified files.");
        if (status.validating && !proofStarted) {
          await done(4, "Completed tracing the native CMYK paths.");
          await start(5, "Interpreting the EPS files and checking print proof dimensions.");
          proofStarted = true;
        }
        if (status.status === "completed") {
          if (!container) throw new ProductionError("The hosted run ended without a downloadable artifact workspace.");
          break;
        }
        if (index === 143) {
          await step.do("cancel-expired-provider-run", noRepeat, async () => {
            try { await openAI(env, "/responses/" + responseId + "/cancel", { method: "POST" }); }
            catch { /* The provider might have just completed the run. */ }
          });
          throw new ProductionError("The hosted production run exceeded its time window.");
        }
        await step.sleep("wait-provider-" + index, "10 seconds");
      }
      if (!container) throw new ProductionError("The vectorization workspace is unavailable.");
      const finishedContainer = container;
      const { measured, ids } = await step.do("read-render-evidence", recover, () =>
        getValidation(env, finishedContainer, { front: frontHash, back: backHash }));
      if (!proofStarted) {
        await done(4, "Completed tracing the native CMYK paths.");
        await start(5, "Independently checking the rendered EPS files and measurements.");
      }
      const frontReport = await step.do("verify-front-eps", recover, () => validatePanel(env, id, finishedContainer, "front", ids, measured.front));
      const backReport = await step.do("verify-back-eps", recover, () => validatePanel(env, id, finishedContainer, "back", ids, measured.back));
      await done(5, "Verified native CMYK paths, zero embedded raster objects, and both 600 DPI proofs.");

      await start(6, "Building the Master ZIP with both EPS files, both artwork JPGs, and the technical report.");
      const report = await step.do("package-outputs", recover, async () => {
        const current = await jobRow(env, id);
        if (!current) throw new ProductionError("The production job is unavailable.");
        return packageOutput(env, current, measured, frontReport, backReport);
      });
      await step.do("publish-verified-results", recover, () => commit(env, id, report));
      await step.do("release-provider-masters", noRepeat, async () => {
        for (const file of [front, back]) {
          try { await openAI(env, "/files/" + file, { method: "DELETE" }, 10_000); }
          catch { console.warn("A hosted artwork file could not be deleted after verification", id); }
        }
      });
      return { id, complete: true };
    } catch (error) {
      const message = error instanceof ProductionError ? error.message : "Production could not finish. Review the last recorded step and try a new job.";
      console.warn("Production stopped", id, position, error instanceof Error ? error.name : "unknown");
      await step.do("record-production-failure", recover, () => record(env, id, position, "failed", message));
      return { id, complete: false };
    }
  }
}
