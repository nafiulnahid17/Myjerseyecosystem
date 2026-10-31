from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'app.js').read_text()

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

