import type { SceneBrief } from "../../../objects/gallery/SceneBrief";
import { ColorSwatch } from "../../../components/ui";

export interface SceneReadingPanelProps {
  readonly brief: SceneBrief | null;
}

/** 场景对照：当前采用场景是如何「读」这组照片的（题面中的情绪、记忆解读与色板）。 */
export function SceneReadingPanel({ brief }: SceneReadingPanelProps) {
  return (
    <section className="rounded-xl bg-night p-6 text-surface" aria-label="场景如何读这组照片">
      <h2 className="text-h2">场景如何读这组照片</h2>
      {brief === null ? (
        <p className="mt-3 text-body text-surface/70">
          还没有成功生成的三维场景。生成后，这里会显示场景依据的情绪与记忆解读。
        </p>
      ) : (
        <>
          <p className="mt-3 font-serif text-h2">{brief.mood}</p>
          <p className="mt-2 text-body text-surface/80">{brief.memoryReading}</p>
          <div className="mt-4 flex gap-2" aria-label="场景色板">
            {brief.palette.map((color) => (
              <ColorSwatch key={color} color={color} className="h-6 w-6 border border-surface/20" />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
