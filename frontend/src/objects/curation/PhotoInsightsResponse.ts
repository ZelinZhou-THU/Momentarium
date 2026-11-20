import {
  requireArray,
  requireNullable,
  requireObject,
  requireString,
  requireStringArray,
} from "../../apis/shared/decode";
import { parseSceneBrief } from "../gallery/SceneBrief";
import type { SceneBrief } from "../gallery/SceneBrief";

/** 契约 §3.1 PhotoAnalysis：单张照片的情绪与记忆解读。 */
export interface PhotoAnalysis {
  readonly description: string;
  readonly mood: string;
  readonly palette: readonly string[];
  readonly memoryCues: readonly string[];
  readonly sensory: string;
  readonly suggestedCaption: string;
}

/** 契约 §3.1 PhotoAnalysisView(photoId, analysis, model, analyzedAt)。 */
export interface PhotoAnalysisView {
  readonly photoId: string;
  readonly analysis: PhotoAnalysis;
  readonly model: string;
  readonly analyzedAt: string;
}

/** 契约 §3.1 PhotoInsightsResponse(analyses, latestBrief?)。 */
export interface PhotoInsightsResponse {
  readonly analyses: readonly PhotoAnalysisView[];
  readonly latestBrief: SceneBrief | null;
}

const parsePhotoAnalysis = (value: unknown, path: string): PhotoAnalysis => {
  const record = requireObject(value, path);
  return {
    description: requireString(record.description, `${path}.description`),
    mood: requireString(record.mood, `${path}.mood`),
    palette: requireStringArray(record.palette, `${path}.palette`),
    memoryCues: requireStringArray(record.memoryCues, `${path}.memoryCues`),
    sensory: requireString(record.sensory, `${path}.sensory`),
    suggestedCaption: requireString(record.suggestedCaption, `${path}.suggestedCaption`),
  };
};

const parsePhotoAnalysisView = (value: unknown, path: string): PhotoAnalysisView => {
  const record = requireObject(value, path);
  return {
    photoId: requireString(record.photoId, `${path}.photoId`),
    analysis: parsePhotoAnalysis(record.analysis, `${path}.analysis`),
    model: requireString(record.model, `${path}.model`),
    analyzedAt: requireString(record.analyzedAt, `${path}.analyzedAt`),
  };
};

export const parsePhotoInsightsResponse = (value: unknown, path = "photoInsights"): PhotoInsightsResponse => {
  const record = requireObject(value, path);
  return {
    analyses: requireArray(record.analyses, `${path}.analyses`).map((item, index) =>
      parsePhotoAnalysisView(item, `${path}.analyses[${index}]`),
    ),
    latestBrief: requireNullable(record.latestBrief, `${path}.latestBrief`, parseSceneBrief),
  };
};
