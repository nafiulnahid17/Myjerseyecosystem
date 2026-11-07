from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'app.js').read_text()
shell=(root/'index.html').read_text()

def test_frameforge_has_only_shipped_templates():
    assert source.count("{template_id:'mockup_")==3
    assert source.count("{template_id:'video_")==3
    assert 'api/frameforge/jobs/mockup' in source
    assert 'api/frameforge/jobs/${state.frames.mockup.job_id}/video' in source

def test_autofly_is_artboard_one_click_no_templates():
    assert 'One-Click Artboard AI Orchestration' in source
    assert 'api/autofly/jobs/' in source
    assert "const path=w==='combined'?'from-combined':'from-panels'" in source
    assert "state.autoflyWorkflow='" not in source # no unwanted mutation in template picker

def test_no_demo_job_status_and_has_fail_closed_mode():
    assert 'function simulation(' not in source.lower()
    assert 'generate fake' not in source.lower()
    assert 'strict_true_vector:true' in source
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
    for label in ['All Tools','ReVector AI','Artboard AI','Frame Forge AI','AssetsX AI',
                  'ArtFlux AI','TraceLock AI','BatchPilot AI','AI File Creator',
                  'Plan &amp; Credits','Analytics','Users','Tool Uses Overview',
                  'Auto Fix','Instant Support']:
        assert label in shell
    assert 'Assetory' not in shell

def test_all_tools_have_two_real_mode_values_and_brand_assets():
    assert "mode:{artboard:'quality',frame:'quality',assets:'quality',autofly:'quality'}" in source
    assert 'Fast & Cost-Effective Mode' in source
    assert 'data-mode="quality"' in source
    assert 'data-mode="cost_effective"' in source
    for asset in ['artboard-ai.svg','frame-forge-ai.svg','assetsx-ai.svg','autofly.svg','ecosystem-hero.svg']:
        assert (root/'assets'/asset).is_file()

def test_reference_aligned_v4_workspaces_and_honest_empty_states():
    for function in ['homeV4','overviewV4','artboardPageV4','framePageV4','assetsPageV4','autoflyPageV4']:
        assert f'function {function}(' in source
    for marker in ['alltools-board','frame-layout','assets-layout','artboard-layout','autofly-layout']:
        assert marker in source or marker in (root/'styles.css').read_text()
    for text in ['No workspace files loaded','No engine analysis yet','No production files returned yet']:
        assert text in source


def test_home_navigation_order_and_no_tool_overview_route():
    nav=shell.split('<nav id="mainNav"')[1].split('</nav>')[0]
    assert nav.index('data-tool="home"') < nav.index('data-tool="artboard"') < nav.index('data-tool="overview"')
    assert 'data-tool="tool-overview"' not in nav
    assert "tool:'home'" in source

def test_ten_real_reference_webp_assets_and_template_source_ids():
    visuals=['tool-artboard','tool-frame','tool-assets','tool-autofly']
    templates=['mockup_luxury_float','mockup_stadium_hero','mockup_editorial_launch',
               'video_luxury_360','video_stadium_reveal','video_kinetic_social']
    for n in visuals+templates:
        p=root/'assets'/'media'/f'{n}.webp'
        assert p.is_file() and 1000 < p.stat().st_size < 120000
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
    assert "ai_configured" in source
    assert 'AI Config' in source
    assert '<small>Server</small>' not in shell
    assert '<small>Fallback AI</small>' not in shell
    assert '<small>Server</small>' not in source
    assert '<small>Fallback AI</small>' not in source
    assert 'function artboardPreview()' in source
    assert 'function updateArtboardPreview()' in source
    assert 'retryFailedArtboardStage' in source
    assert 'artboard-console' in source
    assert 'function jobPoll(' in source
    assert 'j.preview_path' in source
    assert 'j.progress' in source
    assert 'state.lastMode' in source


def test_artboard_live_pipeline_and_production_telemetry_contract():
    for marker in [
        'function artboardStageIndex()',
        'data-live-steps=',
        'state.activePipeline=terminal',
        "state.artboardJob=j",
        'function liveProductionDetails()',
        'function validationChecklist()',
        "['Model',d.provider.model",
        'Vectorizer',
        'EPSF 3.0 · PS Level ≤ 2 · CMYK',
        'Continue with Illustrator',
        'navigator.canShare',
        'function artboardExportPanel()',
        'function artboardProgressDock()',
        "{summary:false}",
    ]:
        assert marker in source
    assert "i===0?'current'" not in source
    assert 'state.artboardResult=await call(\'artboard\',\'api/artboard/projects/\'+p.project_id)' in source
    assert 'class="live-dialog-list"' not in source
    assert 'Current stage intelligence only' in source
    assert 'Requested export formats' in source
    assert source.index('Export & Delivery') < source.index('Continue with Illustrator')


def test_artboard_layout_uses_natural_panel_proportions():
    css=(root/'styles.css').read_text()
    assert 'align-items:start' in css
    assert '.artboard-console{height:auto' in css
    assert '.production-live-dialog' in css
    assert '.artboard-workbench' in css
    assert '.artboard-progress-dock' in css
    assert '.artboard-console .terminal-dock' in css
    assert '.artboard-export-page' in css
    assert 'grid-template-columns:minmax(245px,285px) minmax(450px,1fr) minmax(300px,360px)' in css


def test_artboard_semantic_grouping_is_server_measured_not_fake_progress():
    source = (Path(__file__).parents[1] / 'artboard-v2.js').read_text()
    assert "semantic_editing" in source
    assert "status==='MEASURED'" in source
    assert "selectable_color_families" in source
    assert "native Illustrator layers are not independently certified" in source
    assert "Semantic SVG color-family grouping has not yet been measured" in source


def test_artboard_semantic_ai_failure_is_not_misreported_as_approved():
    source = (Path(__file__).parents[1] / 'artboard-v2.js').read_text()
    assert "semantic_guidance?.status" in source
    assert "LOCAL_RASTER_FALLBACK" in source
    assert "this is NOT a passed AI semantic review" in source
    assert "AI_GUIDED" in source


def test_artboard_resume_does_not_hide_paid_semantic_ai_calls():
    source = (Path(__file__).parents[1] / 'app.js').read_text()
    assert "No new image generation; semantic guidance and vector review may use paid AI calls." in source
    assert "No new AI provider requests." not in source


def test_mockup_asset_coverage_and_artboard_stage_visuals():
    from pathlib import Path
    for asset in ['revector','artflux','tracelock','batchpilot','filecreator']:
        assert (root/'assets'/'media'/f'tool-{asset}.svg').is_file()
    assert (root/'mockup-alignment.css').is_file()
    assert 'mockup-alignment.css' in shell
    artboard=(root/'artboard-v2.js').read_text()
    assert 'abv2-centered-brand' in artboard
    assert 'abv2-stage-rail' in artboard
    assert "ui.phase==='analyze'&&state.busy&&stageOf(state.stage,state.progress)==='Analyzing'" in artboard
    assert 'Illustrative visual · awaiting real artwork' in artboard
    assert '<span class="abv2-art-grid" aria-hidden="true"></span>${generating?' not in artboard
