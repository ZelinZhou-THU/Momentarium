import asyncio, json, sys
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = next(parent for parent in Path(__file__).resolve().parents if (parent / "frontend/package.json").is_file())
OUT = ROOT / 'backend/target/scene-panel-browser'
OUT.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        print('launching Chromium', flush=True)
        browser = await p.chromium.launch(headless=True, args=['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])
        print('Chromium ready', flush=True)
        page = await browser.new_page(viewport={'width': 1440, 'height': 1000})
        requests = []
        events = []
        page.on('pageerror', lambda error: events.append(str(error)))
        page.on('console', lambda msg: events.append(msg.type+': '+msg.text) if msg.type in ['warning','error'] else None)
        async def route_request(route):
            url = route.request.url
            if '/vendor/three.min.js' in url:
                await route.fulfill(path=str(ROOT / 'frontend/public/vendor/three.min.js'), content_type='application/javascript')
            elif url == 'http://127.0.0.1:5178/scene-panel-fixture.jpg':
                await route.fulfill(path=str(ROOT / 'tests/fixtures/smoke/synthetic-smoke-1024.jpg'), content_type='image/jpeg')
            elif url.startswith(('http://127.0.0.1:5178/', 'http://localhost:5178/')):
                if '/api/' in url:
                    requests.append(url)
                    await route.abort()
                else:
                    await route.continue_()
            else:
                requests.append(url)
                await route.abort()
        await page.route('**/*', route_request)
        results = []
        async def defer_first(route):
            response = await route.fetch()
            html = await response.text()
            await route.fulfill(response=response, body=html.replace('</head>', '<style>section{margin-top:2000px!important}</style></head>'))

        for fault in (['timeout'] if '--timeout-only' in sys.argv else ['syntax', 'throw', 'timeout']):
            if fault == 'syntax':
                await page.route('**/tests/browser/scene-panel/index.html', defer_first)
            print('checking '+fault, flush=True)
            await page.goto('http://127.0.0.1:5178/tests/browser/scene-panel/index.html')
            if fault == 'syntax':
                await page.wait_for_timeout(800)
                assert json.loads(await page.locator('#evidence').inner_text()) == [], '离屏时不应提交评审'
                await page.locator('section').scroll_into_view_if_needed()
                await page.unroute('**/tests/browser/scene-panel/index.html', defer_first)
            if fault != 'syntax':
                await page.get_by_role('button', name=fault, exact=True).click()
            try:
                await page.get_by_text(f'Fault {fault}: PASS', exact=True).wait_for(timeout=45000)
            except Exception:
                (OUT/f'{fault}-failure.json').write_text(json.dumps({'body':await page.locator('body').inner_text(),'events':events,'requests':requests},ensure_ascii=False,indent=2),encoding='utf-8')
                await page.screenshot(path=str(OUT/f'{fault}-failure.png'),full_page=True)
                raise
            evidence = json.loads(await page.locator('#evidence').inner_text())
            assert len(evidence) == 2, evidence
            assert evidence[0]['captures'] == 0 and evidence[0]['errors'], evidence
            assert evidence[1]['captures'] == 4 and evidence[1]['errors'] == [], evidence
            assert evidence[1]['fps'] >= 20, evidence
            await page.wait_for_timeout(500)
            assert json.loads(await page.locator('#evidence').inner_text()) == evidence
            await page.get_by_role('button', name='将当前视角设为封面', exact=True).click()
            await page.get_by_text('已设为封面。', exact=True).wait_for(timeout=15000)
            assert json.loads(await page.locator('#evidence').inner_text()) == evidence
            await page.screenshot(path=str(OUT/f'{fault}.png'), full_page=True)
            results.append({'fault':fault,'reviewSubmissions':evidence,'coverSaved':True,'noRepeatedReview':True})
            (OUT/f'{fault}-result.json').write_text(json.dumps(results[-1],ensure_ascii=False,indent=2),encoding='utf-8')
        await page.goto('http://127.0.0.1:5178/tests/browser/scene-panel/index.html?mode=ready')
        await page.get_by_role('button', name='将当前视角设为封面', exact=True).wait_for()
        await page.get_by_role('button', name='将当前视角设为封面', exact=True).click()
        await page.get_by_text('已设为封面。', exact=True).wait_for(timeout=15000)
        assert json.loads(await page.locator('#evidence').inner_text()) == [], '成功场景刷新不得重新评审'
        await page.goto('http://127.0.0.1:5178/tests/browser/scene-panel/index.html?mode=cancel')
        await page.get_by_role('button', name='停止生成', exact=True).click()
        await page.get_by_text('已停止生成', exact=True).first.wait_for()
        await page.wait_for_timeout(700)
        assert json.loads(await page.locator('#evidence').inner_text()) == []
        assert '正在准备沙箱展示图' not in await page.locator('section').inner_text()
        assert requests == [], requests
        (OUT/'browser-results.json').write_text(json.dumps({'results':results,'restoredSucceededPreviewNoReview':True,'cancelGeneratingNoReview':True,'offscreenDeferred':True,'blockedNetworkOrApiRequests':requests}, ensure_ascii=False,indent=2),encoding='utf-8')
        await browser.close()
        print(json.dumps({'cases':len(results),'result':'PASS'},ensure_ascii=False))

asyncio.run(main())
