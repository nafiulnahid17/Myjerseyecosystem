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
    for route in ['home','overview','tool-overview','emergency','credits','users','support','get-support','report','settings']:
        assert f'data-tool="{route}"' in shell
    assert 'function home()' in source
    assert 'function overview()' in source
    assert 'function toolOverview()' in source
    assert 'Credit system is not connected yet' in source
    assert 'User directory is not connected yet' in source
    assert 'Support submission backend is not connected' in source
    for label in ['Overview','All Tools','Tool Overview','Add Credits','Support','Get Support','Report a Problem','Users']:
        assert label in shell

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

