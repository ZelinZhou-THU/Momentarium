import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ScenePanel, { type ScenePanelPhoto } from '../../../src/pages/Workspace/components/ScenePanel';
import { createSceneRunFixture } from '../../../src/scene/mocks/sceneRunFixtures';
import type { SceneApiClient, ReviewSceneSubmission } from '../../../src/pages/Workspace/components/ScenePanel/sceneClient';
import type { SceneRunView } from '../../../src/objects/gallery/SceneRunView';
import '../../../src/index.css';

type Fault = 'syntax' | 'throw' | 'timeout';
const FAULTS: Record<Fault,string> = {
  syntax: 'function build(ctx) { const = ; }',
  throw: 'function build(ctx) { throw new Error("REPAIR_BUILD_TEST"); }',
  timeout: 'function build(ctx) { const stop = Date.now() + 10000; while (Date.now() < stop) {} }',
};
const GOOD = 'function build(ctx) { const T = ctx.THREE; ctx.setBackground(0x223344); ctx.scene.add(new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshNormalMaterial())); ctx.camera.position.set(4,3,5); ctx.camera.lookAt(0,0,0); ctx.addOrbitControls(); }';
const PHOTOS: readonly ScenePanelPhoto[] = [{ id: 'repair-photo', contentUrl: '/scene-panel-fixture.jpg' }];

function Case({fault}:{fault:Fault}) {
  const [submissions,setSubmissions] = useState<readonly {captures:number;errors:readonly string[];fps:number}[]>([]);
  const mode = new URLSearchParams(window.location.search).get('mode');
  const [status,setStatus] = useState(mode === 'ready' ? 'READY' : 'running');
  const initial = useMemo(()=>createSceneRunFixture({status:mode === 'ready' ? 'succeeded' : mode === 'cancel' ? 'generating' : 'awaiting_capture',source:mode === 'ready' ? 'fallback' : 'ai',isCurrent:mode === 'ready',photoIds:['repair-photo'],code:mode === 'ready' ? GOOD : FAULTS[fault],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}),[fault, mode]);
  const current = useRef<SceneRunView>(initial);
  const [adoptedRun, setAdoptedRun] = useState<SceneRunView | null>(initial.isCurrent ? initial : null);
  const client = useMemo<SceneApiClient>(()=>({
      generateScene: async()=>current.current,
      getSceneRun: async()=>current.current,
      cancelScene: async()=>({...current.current,status:'cancelled'}),
      reviewScene: async (submission:ReviewSceneSubmission)=>{
        setSubmissions(previous=>[...previous,{captures:submission.captures.length,errors:submission.runtime.errors,fps:submission.runtime.fps}]);
        if (current.current.attempts===0) {
          if(submission.captures.length!==0 || submission.runtime.errors.length===0) throw new Error('Crash evidence missing');
          current.current={...current.current,attempts:1,status:'awaiting_capture',code:GOOD,updatedAt:new Date().toISOString()};
        } else {
          if(submission.captures.length!==4 || submission.runtime.errors.length!==0) throw new Error('Repair capture missing');
          current.current={...current.current,status:'succeeded',source:'fallback',isCurrent:true,review:null,updatedAt:new Date().toISOString()};
          setAdoptedRun(current.current);
          setStatus('PASS');
        }
        return current.current;
      },
    }),[]);
  return <><h1>Fault {fault}: {status}</h1><pre id="evidence">{JSON.stringify(submissions,null,2)}</pre><ScenePanel exhibitionId={initial.exhibitionId} photos={PHOTOS} initialRun={initial} currentRun={adoptedRun} client={client} onSaveSceneCover={async()=>{}} /></>;
}
function Harness(){const [fault,setFault]=useState<Fault>('syntax');return <main className="mx-auto max-w-3xl p-4"><p>Actual ScenePanel / runtime. Injected client, no real model calls.</p><nav>{(['syntax','throw','timeout'] as const).map(mode=><button className="m-2 border p-2" key={mode} onClick={()=>setFault(mode)}>{mode}</button>)}</nav><Case key={fault} fault={fault}/></main>;}
const root = document.getElementById('root');
if (root === null) throw new Error('Missing harness root');
createRoot(root).render(<Harness/>);
