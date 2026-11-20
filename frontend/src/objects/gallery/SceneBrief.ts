import {
  requireNullable,
  requireObject,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";

/** 契约 §4.1 SceneBrief：场景题面与入口导语。 */
export interface SceneBrief {
  readonly mood: string;
  readonly memoryReading: string;
  readonly scenePrompt: string;
  readonly entranceNarration: string;
  readonly palette: string[];
  readonly avoid: string[];
  readonly userHint: string | null;
}

export const parseSceneBrief = (value: unknown, path = "brief"): SceneBrief => {
  const record = requireObject(value, path);
  return {
    mood: requireString(record.mood, `${path}.mood`),
    memoryReading: requireString(record.memoryReading, `${path}.memoryReading`),
    scenePrompt: requireString(record.scenePrompt, `${path}.scenePrompt`),
    entranceNarration: requireString(record.entranceNarration, `${path}.entranceNarration`),
    palette: requireStringArray(record.palette, `${path}.palette`),
    avoid: requireStringArray(record.avoid, `${path}.avoid`),
    userHint: requireNullable(record.userHint, `${path}.userHint`, requireString),
  };
};
