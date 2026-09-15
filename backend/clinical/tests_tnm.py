from django.test import SimpleTestCase

from .tnm import assess


class TnmAssessmentTests(SimpleTestCase):
    def test_complete_m0_candidate(self):
        result = assess("T2a", "N0", {"distant_metastasis_assessment_complete": True})
        self.assertEqual(result["m_candidate"], "M0")
        self.assertEqual(result["stage_group_candidate"], "IB")

    def test_extrathoracic_lesion_overrides_tn_stage(self):
        result = assess("T1a", "N0", {"distant_metastasis_assessment_complete": True, "extrathoracic_lesions": [{"status": "confirmed", "organ_system": "bone"}]})
        self.assertEqual(result["m_candidate"], "M1b")
        self.assertEqual(result["stage_group_candidate"], "IVA")
