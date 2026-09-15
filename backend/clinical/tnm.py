"""Physician-review-only TNM9 candidate staging helpers.

This deliberately contains only the deterministic, reviewable staging rules.
It does not call the internally validated M-risk candidate model and must not
be used to automatically finalize a patient's stage.
"""
from collections import Counter


VALID_T = {"TX", "T0", "TIS", "T1MI", "T1A", "T1B", "T1C", "T1", "T2A", "T2B", "T2", "T3", "T4"}
VALID_N = {"NX", "N0", "N1", "N2", "N2A", "N2B", "N3"}


def _normalise(value):
    return str(value).strip().upper().replace(" ", "")


def _display(value):
    special = {"TIS": "Tis", "T1MI": "T1mi", "M1C1": "M1c1", "M1C2": "M1c2", "M_INDETERMINATE": "M_indeterminate"}
    if value in special:
        return special[value]
    return value[:-1] + value[-1].lower() if value[-1:] in {"A", "B", "C"} else value


def m_candidate(evidence):
    lesions = [x for x in evidence.get("extrathoracic_lesions", []) if x.get("status") in {"confirmed", "high_suspicion"}]
    organs = Counter(str(x.get("organ_system", "unknown")) for x in lesions)
    m1a = []
    for field, label in (("contralateral_lung_nodules", "contralateral lung nodule(s)"), ("pleural_nodules", "pleural nodule(s)"), ("pericardial_nodules", "pericardial nodule(s)")):
        if int(evidence.get(field, 0) or 0) > 0:
            m1a.append(label)
    if evidence.get("malignant_pleural_effusion") is True:
        m1a.append("malignant pleural effusion")
    if evidence.get("malignant_pericardial_effusion") is True:
        m1a.append("malignant pericardial effusion")
    if len(lesions) == 1:
        return "M1B", ["single extrathoracic metastasis"], dict(organs)
    if len(lesions) > 1 and len(organs) == 1:
        return "M1C1", ["multiple extrathoracic metastases in one organ system"], dict(organs)
    if len(lesions) > 1:
        return "M1C2", ["multiple extrathoracic metastases in multiple organ systems"], dict(organs)
    if m1a:
        return "M1A", m1a, dict(organs)
    if evidence.get("distant_metastasis_assessment_complete") is True:
        return "M0", ["no accepted distant metastatic evidence"], dict(organs)
    return "M_INDETERMINATE", ["distant metastasis assessment is incomplete"], dict(organs)


def _m0_stage(t, n):
    table = {
        ("TIS", "N0"): "0", ("T1MI", "N0"): "IA1", ("T1A", "N0"): "IA1", ("T1B", "N0"): "IA2", ("T1C", "N0"): "IA3",
        ("T2A", "N0"): "IB", ("T2B", "N0"): "IIA", ("T3", "N0"): "IIB", ("T4", "N0"): "IIIA",
    }
    if (t, n) in table:
        return table[t, n], None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C"} and n == "N1": return "IIA", None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C"} and n == "N2A": return "IIB", None
    if t in {"T2", "T2A", "T2B"} and n == "N1": return "IIB", None
    if t in {"T3", "T4"} and n == "N1": return "IIIA", None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C"} and n == "N2B": return "IIIA", None
    if t in {"T2", "T2A", "T2B", "T3"} and n == "N2A": return "IIIA", None
    if t in {"T2", "T2A", "T2B", "T3", "T4"} and n == "N2B": return "IIIB", None
    if t in {"T1", "T1MI", "T1A", "T1B", "T1C", "T2", "T2A", "T2B"} and n == "N3": return "IIIB", None
    if t in {"T3", "T4"} and n == "N3": return "IIIC", None
    if n == "N2": return None, "N2 must be subdivided into N2a or N2b for TNM9 stage grouping"
    if n == "NX": return None, "Regional lymph nodes cannot be assessed"
    return None, "Unsupported or incomplete T/N/M0 combination"


def assess(t_value, n_value, imaging_evidence):
    t, n = _normalise(t_value), _normalise(n_value)
    errors = []
    if t not in VALID_T: errors.append(f"Unsupported T category: {t}")
    if n not in VALID_N: errors.append(f"Unsupported N category: {n}")
    m, reasons, organ_counts = m_candidate(imaging_evidence)
    if errors:
        stage, warnings = None, errors
    elif m in {"M1A", "M1B"}:
        stage, warnings = "IVA", []
    elif m in {"M1C1", "M1C2"}:
        stage, warnings = "IVB", []
    elif m == "M_INDETERMINATE":
        stage, warnings = None, ["M assessment is incomplete"]
    else:
        stage, warning = _m0_stage(t, n)
        warnings = [warning] if warning else []
    return {"t_candidate": _display(t), "n_candidate": _display(n), "m_candidate": _display(m), "ctnm_candidate": f"c{_display(t)}{_display(n)}{_display(m)}", "stage_group_candidate": stage, "stage_group_status": "candidate_ready" if stage else "indeterminate", "warnings": warnings, "m_evidence": {"reasons": reasons, "organ_counts": organ_counts}, "finalization_status": "physician_review_required", "clinical_use_warning": "Decision support only. This cTNM candidate does not replace physician staging."}
