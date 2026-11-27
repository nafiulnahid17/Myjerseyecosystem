from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'app.js').read_text()
shell=(root/'index.html').read_text()

def test_frameforge_has_only_shipped_templates():
    assert source.count("{template_id:'mockup_")==3
    assert source.count("{template_id:'video_")==3
    assert 'api/frameforge/jobs/mockup' in source
    assert 'api/frameforge/jobs/${state.frames.mockup.job_id}/video' in source

def test_autofly_is_one_click_no_templates():
    assert 'One-Click Artwork Orchestration' in source
    assert 'api/autofly/jobs/' in source
    assert "const path=w==='combined'?'from-combined':'from-panels'" in source
    assert "state.autoflyWorkflow='" not in source # no unwanted mutation in template picker

def test_no_demo_job_status_and_has_fail_closed_mode():
    assert 'function simulation(' not in source.lower()
    assert 'generate fake' not in source.lower()
    assert 'Live API reachable' in source
    assert 'No API job has been submitted in this session.' in source
    for fabricated in ['jersey_design.png','home_kit.psd','away_design.ai','68%','FRONTEND SIMULATION']:
        assert fabricated not in source

def test_navigation_dashboard_and_support_surfaces_exist():
    for route in ['home','overview','credits','users','support','settings']:
        assert f'data-tool="{route}"' in shell
    # Emergency and detailed support routes remain accessible from the Support Center.
    for route in ['emergency','get-support','report']:
        assert f'data-tool="{route}"' in source
    assert 'function home()' in source
    assert 'function overview()' in source
    assert 'data-tool="tool-overview"' not in shell
    assert "'tool-overview':toolOverview" not in source
    assert 'Credit system is not connected yet' in source
    assert 'User directory is not connected yet' in source
    assert 'Support submission backend is not connected' in source
    for label in ['All Tools','ReVector AI','Production Studio','Frame Forge AI','AssetsX AI',
                  'ArtFlux AI','TraceLock AI','BatchPilot AI','AI File Creator',
                  'Plan &amp; Credits','Analytics','Users','Tool Uses Overview',
                  'Auto Fix','Instant Support']:
        assert label in shell
    assert 'Assetory' not in shell

def test_all_tools_have_two_real_mode_values_and_brand_assets():
    assert "mode:{frame:'quality',assets:'quality',autofly:'quality'}" in source
    assert 'Fast & Cost-Effective Mode' in source
    assert 'data-mode="quality"' in source
    assert 'data-mode="cost_effective"' in source
    for asset in ['my-jersey.svg','frame-forge-ai.svg','assetsx-ai.svg','autofly.svg','ecosystem-hero.svg']:
        assert (root/'assets'/asset).is_file()

def test_reference_aligned_v4_workspaces_and_honest_empty_states():
    for function in ['homeV4','overviewV4','framePageV4','assetsPageV4','autoflyPageV4']:
        assert f'function {function}(' in source
    for marker in ['alltools-board','frame-layout','assets-layout','autofly-layout']:
        assert marker in source or marker in (root/'styles.css').read_text()
    for text in ['No workspace files loaded','No engine analysis yet']:
        assert text in source


def test_home_navigation_order_and_no_tool_overview_route():
    nav=shell.split('<nav id="mainNav"')[1].split('</nav>')[0]
    assert nav.index('data-tool="home"') < nav.index('href="/production-studio/"') < nav.index('data-tool="overview"')
    assert 'data-tool="tool-overview"' not in nav
    assert "tool:'home'" in source

def test_ten_real_reference_webp_assets_and_template_source_ids():
    visuals=['tool-studio','tool-frame','tool-assets','tool-autofly']
    templates=['mockup_luxury_float','mockup_stadium_hero','mockup_editorial_launch',
               'video_luxury_360','video_stadium_reveal','video_kinetic_social']
    for n in visuals+templates:
        p=root/'assets'/'media'/f'{n}.webp'
        assert p.is_file() and 1000 < p.stat().st_size < 300000
        data=p.read_bytes()
        assert data[:4]==b'RIFF' and data[8:12]==b'WEBP'
    assert 'illustrative template artwork, not a generated output' in source
    assert 'class="template-tabs"' not in source
    assert 'function simulation(' not in source.lower()

def test_standalone_builder_embeds_reference_images():
    script=(root/'scripts'/'build-standalone.mjs').read_text()
    assert 'data:image/webp;base64,' in script
    assert 'assets/media/' in script


def test_public_testing_has_no_manual_key_dialog_and_does_not_fabricate_health():
    assert 'Private Workspace' not in shell
    assert 'gatewayDialog' not in shell
    assert 'workspaceKey' not in shell
    assert "statusCheck();" in source
    assert "credentials:'same-origin'" in source
    assert '<small>Server</small>' not in shell
    assert '<small>Fallback AI</small>' not in shell
    assert '<small>Server</small>' not in source
    assert '<small>Fallback AI</small>' not in source
    assert 'function jobPoll(' in source
    assert 'j.progress' in source



def test_studio_assets_and_scope():
    for asset in ['revector','artflux','tracelock','batchpilot','filecreator']:
        assert (root/'assets'/'media'/f'tool-{asset}.svg').is_file()
    assert 'mockup-alignment.css' in shell
    assert 'Production Studio' in (root/'home-theme.js').read_text()
    assert '/api/engine/artboard/' not in source
    assert not any((root/'dist').glob('artboard*'))
    assert not (root/'dist'/'assets'/'artboard-v2').exists()
    studio = root/'production-studio'
    assert (studio/'src'/'main.tsx').is_file()
    assert (root/'dist'/'production-studio'/'index.html').is_file()
    assert not (studio/'worker'/'artwork-prompt.txt').exists()
